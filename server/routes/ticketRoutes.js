import express from 'express';
import Ticket from '../models/Ticket.js';
import Message from '../models/Message.js';
import ActivityLog from '../models/ActivityLog.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { sendSupportReply } from '../utils/emails.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, priority, tags } = req.body;

    // Input Validation
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const ticket = await Ticket.create({
      title,
      description,
      priority: priority || 'medium', // Default to medium
      tags: tags || [],
      createdBy: req.session.userId,
      status: 'open'
    });

    // Log Activity
    await ActivityLog.create({
      userId: req.session.userId,
      action: 'CREATE_TICKET',
      entityType: 'TICKET',
      entityId: ticket._id,
      ipAddress: req.ip
    });

    res.status(201).json(ticket);
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { role, userId } = req.session;
    let query = {};

    if (role === 'user') {
      query = { createdBy: userId };
    } 

    const tickets = await Ticket.find(query)
      .sort({ updatedAt: -1 }) // Newest updates first
      .populate('createdBy', 'email role') // Show who created it
      .populate('assignedTo', 'email');

    res.json(tickets);
  } catch (err) {
    console.error('List tickets error:', err);
    res.status(500).json({ error: 'Failed to retrieve tickets' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, userId } = req.session;

    const ticket = await Ticket.findById(id)
      .populate('createdBy', 'email')
      .populate('assignedTo', 'email');

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Permission Check
    if (role === 'user' && ticket.createdBy._id.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch Messages
    const messageQuery = { ticketId: id };
    if (role === 'user') {
      messageQuery.isInternal = false;
    }

    const messages = await Message.find(messageQuery)
      .sort({ createdAt: 1 }) 
      .populate('sender', 'email role');

    res.json({ ticket, messages });
  } catch (err) {
    console.error('Get ticket details error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, isInternal } = req.body;
    const { role, userId } = req.session;

    if (!content) return res.status(400).json({ error: 'Message content is required' });

    const ticket = await Ticket.findById(id).populate('createdBy');
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // Permission Check
    if (role === 'user' && ticket.createdBy._id.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create Message
    const message = await Message.create({
      ticketId: id,
      sender: userId,
      content,
      isInternal: (role === 'admin' || role === 'support') ? !!isInternal : false
    });

    // Update Status 
    if (role === 'user') {
      if (ticket.status === 'resolved') ticket.status = 'open';
    } else {
      if (ticket.status === 'open') ticket.status = 'in_progress';
    }
    await ticket.save();

    if ((role === 'admin' || role === 'support') && !message.isInternal) {
      const userEmail = ticket.createdBy.email;
      
      sendSupportReply(userEmail, ticket._id.toString().slice(-4), content)
        .then(success => {
            if (success) {
                ActivityLog.create({
                    userId,
                    action: 'EMAIL_SENT',
                    entityType: 'TICKET',
                    entityId: ticket._id,
                    metadata: { recipient: userEmail }
                });
            }
        });
    }

    // Log Reply 
    await ActivityLog.create({
      userId,
      action: 'REPLY_TICKET',
      entityType: 'TICKET',
      entityId: id,
      metadata: { messageId: message._id }
    });

    res.status(201).json(message);
  } catch (err) {
    console.error('Reply error:', err);
    res.status(500).json({ error: 'Failed to post reply' });
  }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { role, userId } = req.session;

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    if (role === 'user') {
      if (ticket.createdBy.toString() !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (status !== 'closed' && status !== 'resolved') {
        return res.status(403).json({ error: 'Users can only resolve or close tickets' });
      }
    }

    const oldStatus = ticket.status;
    ticket.status = status;
    await ticket.save();

    await ActivityLog.create({
      userId,
      action: 'UPDATE_STATUS',
      entityType: 'TICKET',
      entityId: id,
      metadata: { from: oldStatus, to: status }
    });

    res.json({ message: 'Status updated', ticket });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;