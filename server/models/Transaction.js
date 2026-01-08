import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  localId: {
    type: String, 
    required: true
  },
  type: {
    type: String,
    enum: ['expense', 'income'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  note: String,
  date: {
    type: Date,
    required: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true 
});

transactionSchema.index({ userId: 1, localId: 1 }, { unique: true });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;