import express from 'express';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { transactions, lastSyncTime, balance, buffer, planned } = req.body;

    if (transactions && Array.isArray(transactions)) {
        const operations = transactions.map(tx => ({
            updateOne: {
                filter: { userId, localId: tx.id },
                update: {
                    userId,
                    localId: tx.id,
                    type: tx.type,
                    amount: tx.amount,
                    note: tx.note,
                    date: tx.timestamp, 
                    lastSyncedAt: new Date()
                },
                upsert: true
            }
        }));
        
        if (operations.length > 0) {
            await Transaction.bulkWrite(operations);
        }
    }

    const updateData = {};
    if (balance !== undefined) updateData.balance = balance;
    if (buffer !== undefined) updateData.buffer = buffer;
    if (planned !== undefined) updateData.planned = planned;

    if (Object.keys(updateData).length > 0) {
        await User.findByIdAndUpdate(userId, updateData);
    }

    const user = await User.findById(userId);
    const serverTransactions = await Transaction.find({ userId });

    const responsePayload = serverTransactions.map(t => ({
        id: t.localId,
        type: t.type,
        amount: t.amount,
        note: t.note,
        timestamp: new Date(t.date).getTime()
    }));

    res.json({ 
        syncedAt: Date.now(),
        transactions: responsePayload,
        balance: user.balance,
        buffer: user.buffer,
        planned: user.planned
    });

  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

export default router;