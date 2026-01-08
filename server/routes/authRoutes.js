import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { generateOTP, sendOTP } from '../utils/emails.js';
import Ticket from '../models/Ticket.js';
import Message from '../models/Message.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

// Helper to hash OTP
const hashOTP = async (otp) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(otp, salt);
};

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user._id;
    req.session.role = user.role;
    req.session.email = user.email;

    user.lastLogin = new Date();
    await user.save();

    await ActivityLog.create({
      userId: user._id,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user._id,
      ipAddress: req.ip,
      metadata: { userAgent: req.get('User-Agent') }
    });

    res.json({ message: 'Login successful', user: { email: user.email, role: user.role } });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  try {
    await ActivityLog.create({ userId, action: 'LOGOUT', entityType: 'USER', entityId: userId });
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Could not log out' });
      res.clearCookie('sid');
      res.json({ message: 'Logout successful' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/register
const ALLOWED_USERS = ['example@email.com'];
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!ALLOWED_USERS.includes(email)) return res.status(403).json({ error: 'This is a closed beta. Your email is not whitelisted.' });

    if (await User.findOne({ email })) return res.status(400).json({ error: 'Email already exists' });

    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const otpExpires = Date.now() + 10 * 60 * 1000;

    const user = await User.create({
      email,
      password,
      role: 'user',
      isActive: false,
      otp: otpHash, 
      otpExpires
    });

    sendOTP(email, otp, 'registration'); 
    
    ActivityLog.create({ userId: user._id, action: 'EMAIL_SENT', entityType: 'SYSTEM', metadata: { type: 'OTP_REGISTER' } });

    res.status(201).json({ message: 'Registration successful. Check email.' });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/verify
router.post('/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email }).select('+otp +otpExpires');
    
    if (!user) return res.status(400).json({ error: 'User not found' });
    if (user.isActive) return res.status(400).json({ error: 'User already verified' });
    if (user.otpExpires < Date.now()) return res.status(400).json({ error: 'OTP expired' });

    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) return res.status(400).json({ error: 'Invalid OTP' });

    user.isActive = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ message: 'Verified' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = generateOTP();
    user.otp = await hashOTP(otp);
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    sendOTP(email, otp, 'reset');
    res.json({ message: 'OTP sent' });
  } catch (err) {
    res.status(500).json({ error: 'Error processing request' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email }).select('+otp +otpExpires');
    
    if (!user || user.otpExpires < Date.now()) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) return res.status(400).json({ error: 'Invalid OTP' });

    user.password = newPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: 'Reset failed' });
  }
});

// GET /auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    isAuthenticated: true,
    user: { id: req.session.userId, email: req.session.email, role: req.session.role }
  });
});

// DELETE /auth/me 
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.session.userId;
    const user = await User.findById(userId).select('+password');
    
    if (!await user.comparePassword(password)) return res.status(401).json({ error: 'Incorrect password' });

    await Ticket.deleteMany({ createdBy: userId });
    await Message.deleteMany({ sender: userId });
    await ActivityLog.deleteMany({ userId: userId });
    await Transaction.deleteMany({ userId: userId });
    await User.findByIdAndDelete(userId);

    req.session.destroy((err) => {
      res.clearCookie('sid');
      res.json({ message: 'Account deleted successfully' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;