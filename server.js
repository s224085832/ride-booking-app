require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Ride = require('./models/Ride');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MONGODB_URI = process.env.MONGODB_URI;

console.log("MONGODB_URI exists:", !!process.env.MONGODB_URI);
console.log("Length:", process.env.MONGODB_URI?.length); 

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('Connection error:', err));

// Distance between two coordinates in km, using the Haversine formula
function getDistanceKm(pickup, dropoff) {
  const R = 6371;
  const dLat = (dropoff.lat - pickup.lat) * Math.PI / 180;
  const dLng = (dropoff.lng - pickup.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(pickup.lat * Math.PI / 180) * Math.cos(dropoff.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Simple flat fare formula: base fare + per-km rate
function calculateFare(pickup, dropoff) {
  const BASE_FARE = 2.5;
  const PER_KM_RATE = 1.2;
  const distanceKm = getDistanceKm(pickup, dropoff);
  return Math.round((BASE_FARE + distanceKm * PER_KM_RATE) * 100) / 100;
}

app.post('/api/rides', async (req, res) => {
  try {
    const { pickup, dropoff } = req.body;
    const fare = calculateFare(pickup, dropoff);
    const ride = new Ride({ pickup, dropoff, fare });
    const savedRide = await ride.save();
    res.status(201).json(savedRide);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/rides', async (req, res) => {
  try {
    const rides = await Ride.find().sort({ createdAt: -1 });
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/rides/:id', async (req, res) => {
  try {
    const { status, driverName, carType } = req.body;
    const update = {};
    if (status) update.status = status;
    if (driverName) update.driverName = driverName;
    if (carType) update.carType = carType;

    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    res.json(ride);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});