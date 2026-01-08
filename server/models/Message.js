import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  isInternal: {
    type: Boolean,
    default: false,
    description: 'If true, only visible to staff'
  },
  attachments: [{
    filename: String,
    url: String,
    mimeType: String
  }]
}, {
  timestamps: true
});

const Message = mongoose.model('Message', messageSchema);

export default Message;