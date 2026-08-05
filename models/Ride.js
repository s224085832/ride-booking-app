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
  status: {
    type: String,
    enum: ['pending', 'accepted', 'completed', 'cancelled'],
    default: 'pending'
  },
  fare: {
    type: Number
  },
  driverName: {
    type: String,
    default: null
  },
  carType: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Ride', rideSchema);