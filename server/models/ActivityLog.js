import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    uppercase: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['TICKET', 'USER', 'MESSAGE', 'SYSTEM']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  }
}, {
  timestamps: { createdAt: true, updatedAt: false } 
});

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;