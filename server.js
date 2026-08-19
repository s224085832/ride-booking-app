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

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('Connection error:', err));

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

async function getRoadDistanceKm(points) {
  const coordsParam = points.map(p => `${p.lng},${p.lat}`).join(';');
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=false`
    );
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
      throw new Error('No route found');
    }
    return data.routes[0].distance / 1000;
  } catch (err) {
    console.error('OSRM unavailable, falling back to straight-line distance:', err.message);
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      total += getDistanceKm(points[i], points[i + 1]);
    }
    return total;
  }
}

async function calculateFare(pickup, stops, dropoff) {
  const BASE_FARE = 15;
  const PER_KM_RATE = 8;
  const route = [pickup, ...(stops || []), dropoff];
  const totalKm = await getRoadDistanceKm(route);
  return Math.round((BASE_FARE + totalKm * PER_KM_RATE) * 100) / 100;
}

app.post('/api/rides', async (req, res) => {
  try {
    const { pickup, dropoff, stops, paymentMethod, cardLast4, riderName } = req.body;
    const fare = await calculateFare(pickup, stops, dropoff);
    const ride = new Ride({
      pickup,
      dropoff,
      stops: stops || [],
      fare,
      paymentMethod: paymentMethod === 'card' ? 'card' : 'cash',
      cardLast4: paymentMethod === 'card' ? cardLast4 : null,
      riderName: riderName || null
    });
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
    const { status, driverName, carType, carReg, carColour, cancelReason, rating } = req.body;
    const update = {};
    if (status) update.status = status;
    if (driverName) update.driverName = driverName;
    if (carType) update.carType = carType;
    if (carReg) update.carReg = carReg;
    if (carColour) update.carColour = carColour;
    if (cancelReason) update.cancelReason = cancelReason;
    if (rating) update.rating = rating;

    if (status === 'completed') {
      update.paymentStatus = 'paid';
    }

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

// ----- Account stats: rides taken (rider) or completed + rating (driver) -----
app.get('/api/stats', async (req, res) => {
  try {
    const { role, name } = req.query;
    if (!role || !name) {
      return res.status(400).json({ error: 'role and name are required' });
    }

    if (role === 'rider') {
      const totalRides = await Ride.countDocuments({ riderName: name, status: 'completed' });
      return res.json({ totalRides });
    }

    if (role === 'driver') {
      const totalRides = await Ride.countDocuments({ driverName: name, status: 'completed' });
      const ratedRides = await Ride.find({ driverName: name, rating: { $ne: null } }).select('rating');
      const avgRating = ratedRides.length
        ? Math.round((ratedRides.reduce((sum, r) => sum + r.rating, 0) / ratedRides.length) * 10) / 10
        : null;
      return res.json({ totalRides, avgRating, ratedCount: ratedRides.length });
    }

    res.status(400).json({ error: 'role must be rider or driver' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rides/:id/messages', async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    res.json(ride.messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rides/:id/messages', async (req, res) => {
  try {
    const { sender, senderName, text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    ride.messages.push({ sender, senderName, text: text.trim() });
    await ride.save();
    res.status(201).json(ride.messages);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/geocode', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();

    if (query.length < 3) {
      return res.json([]);
    }

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json` +
      `&q=${encodeURIComponent(query)}` +
      `&addressdetails=1` +
      `&limit=5` +
      `&countrycodes=za`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'RideBook/1.0' }
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Geocoding error:', err);
    res.status(500).json({ error: 'Unable to search locations' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});