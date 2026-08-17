const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  pickup: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: null }
  },
  dropoff: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: null }
  },
  stops: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: null }
  }],
  status: {
    type: String,
    enum: ['pending', 'accepted', 'completed', 'cancelled'],
    default: 'pending'
  },
  cancelReason: {
    type: String,
    default: null
  },
  fare: {
    type: Number
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card'],
    default: 'cash'
  },
  cardLast4: {
    type: String,
    default: null
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  driverName: {
    type: String,
    default: null
  },
  carType: {
    type: String,
    default: null
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  messages: {
    type: [
      {
        sender: { type: String, enum: ['rider', 'driver'], required: true },
        senderName: { type: String, default: null },
        text: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Ride', rideSchema);