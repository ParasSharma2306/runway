import express from 'express';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(['admin']));

// GET /api/admin/users
// View all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password -otp -otpExpires')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PATCH /api/admin/users/:id/status
// Enable/Disable user
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    // Prevent self-lockout
    if (id === req.session.userId && isActive === false) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    const user = await User.findByIdAndUpdate(
      id, 
      { isActive },
      { new: true }
    ).select('-password');

    await ActivityLog.create({
      userId: req.session.userId,
      action: 'USER_STATUS_UPDATE',
      entityType: 'USER',
      entityId: user._id,
      metadata: { newStatus: isActive ? 'active' : 'inactive' },
      ipAddress: req.ip
    });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// GET /api/admin/logs
router.get('/logs', async (req, res) => {
  try {
    const { userId, action, limit = 50 } = req.query;
    const query = {};

    if (userId) query.userId = userId;
    if (action) query.action = action;

    const logs = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'email role');

    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;