// Require a rider login before using this page
const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
if (!currentUser || currentUser.role !== 'rider') {
  window.location.href = 'index.html';
}
// Initialize the Leaflet map centered on London
const map = L.map('map').setView([51.505, -0.09], 13);

// Add OpenStreetMap tiles as the base layer
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Layer group so ride pins/lines can be cleared and redrawn on every refresh
const rideLayer = L.layerGroup().addTo(map);

// State variables for tracking markers
let pickupMarker = null;
let dropoffMarker = null;
let clickState = 'pickup';
let pickupAddress = '';
let dropoffAddress = '';

// Cache of all rides from the server, and which tab is currently shown
let allRides = [];
let currentView = 'active';

// Cache DOM element references
const instruction = document.getElementById('instruction');
const rideControls = document.getElementById('ride-controls');
const fareEstimate = document.getElementById('fare-estimate');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const ridesList = document.getElementById('rides-list');
const tabActive = document.getElementById('tab-active');
const tabHistory = document.getElementById('tab-history');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

userInfo.textContent = currentUser ? `Hi, ${currentUser.name}` : '';

logoutBtn.addEventListener('click', function () {
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
});

// Define a green icon for pickup markers
const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Define a red icon for dropoff markers
const redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Distance between two coordinates in km, using the Haversine formula
function getDistanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function estimateFare(pickup, dropoff) {
  const BASE_FARE = 2.5;
  const PER_KM_RATE = 1.2;
  const distanceKm = getDistanceKm(pickup, dropoff);
  return Math.round((BASE_FARE + distanceKm * PER_KM_RATE) * 100) / 100;
}

// Turn an ISO date string into a relative "x min ago" label
function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

// Look up a human-readable address for a lat/lng using OpenStreetMap's Nominatim
async function reverseGeocode(latlng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`
    );
    const data = await response.json();
    return data.display_name || null;
  } catch (err) {
    console.error('Error reverse geocoding:', err);
    return null;
  }
}

// Nominatim returns a long full address — trim it to the first few parts
function shortenAddress(fullAddress) {
  if (!fullAddress) return null;
  const parts = fullAddress.split(',').map(p => p.trim());
  return parts.slice(0, 3).join(', ');
}

// Fall back to coordinates if no address was resolved
function displayLocation(point) {
  return point.address || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

// Handle map clicks to place pickup and dropoff markers
map.on('click', async function (e) {
  if (clickState === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker(e.latlng, { icon: greenIcon }).addTo(map).bindPopup('Looking up address...').openPopup();
    clickState = 'dropoff';
    instruction.textContent = 'Now click to set your dropoff location';

    const fullAddress = await reverseGeocode(e.latlng);
    pickupAddress = shortenAddress(fullAddress);
    pickupMarker.bindPopup(`Pickup: ${pickupAddress || 'Unknown address'}`).openPopup();
  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker(e.latlng, { icon: redIcon }).addTo(map).bindPopup('Looking up address...').openPopup();
    clickState = 'done';
    instruction.textContent = 'Ready! Click "Request Ride" to submit.';

    const fare = estimateFare(pickupMarker.getLatLng(), dropoffMarker.getLatLng());
    fareEstimate.textContent = `Estimated fare: $${fare.toFixed(2)}`;
    rideControls.classList.remove('hidden');

    const fullAddress = await reverseGeocode(e.latlng);
    dropoffAddress = shortenAddress(fullAddress);
    dropoffMarker.bindPopup(`Dropoff: ${dropoffAddress || 'Unknown address'}`).openPopup();
  }
});

// Remove both markers and reset state
function resetMarkers() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  pickupMarker = null;
  dropoffMarker = null;
  pickupAddress = '';
  dropoffAddress = '';
  clickState = 'pickup';
  instruction.textContent = 'Click the map to set your pickup location';
  fareEstimate.textContent = '';
  rideControls.classList.add('hidden');
}

resetBtn.addEventListener('click', resetMarkers);

// Switch between Active and History tabs
tabActive.addEventListener('click', function () {
  currentView = 'active';
  tabActive.classList.add('active');
  tabHistory.classList.remove('active');
  renderRides();
});

tabHistory.addEventListener('click', function () {
  currentView = 'history';
  tabHistory.classList.add('active');
  tabActive.classList.remove('active');
  renderRides();
});

// Cancel a pending ride
async function cancelRide(id) {
  try {
    await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' })
    });
    loadRides();
  } catch (err) {
    console.error('Error cancelling ride:', err);
  }
}

function addRideToList(ride) {
  const li = document.createElement('li');
  li.innerHTML = `
    <span class="status ${ride.status}">${ride.status}</span>
    <span class="timestamp">${timeAgo(ride.createdAt)}</span><br>
    Pickup: ${displayLocation(ride.pickup)}<br>
    Dropoff: ${displayLocation(ride.dropoff)}<br>
    ${ride.fare != null ? `Fare: $${ride.fare.toFixed(2)}<br>` : ''}
    ${ride.driverName ? `<span class="driver-info">Driver: ${ride.driverName} (${ride.carType || 'car type not set'})</span><br>` : ''}
    ${ride.status === 'pending' ? `<button class="cancel-btn" onclick="cancelRide('${ride._id}')">Cancel</button>` : ''}
  `;
  ridesList.appendChild(li);
}

// Render the rides list based on the currently selected tab
function renderRides() {
  ridesList.innerHTML = '';
  const filtered = allRides.filter(ride => {
    if (currentView === 'active') return ride.status === 'pending' || ride.status === 'accepted';
    return ride.status === 'completed' || ride.status === 'cancelled';
  });

  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.style.background = 'transparent';
    empty.style.border = 'none';
    empty.textContent = currentView === 'active' ? 'No active rides yet.' : 'No ride history yet.';
    ridesList.appendChild(empty);
    return;
  }

  filtered.forEach(addRideToList);
}

function addRideToMap(ride) {
  // Only show pins/lines for rides that are still in progress
  if (ride.status !== 'pending' && ride.status !== 'accepted') return;

  L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
    radius: 8,
    color: '#00d4aa',
    fillColor: '#00d4aa',
    fillOpacity: 0.7
  }).addTo(rideLayer).bindPopup(`Pickup: ${displayLocation(ride.pickup)}`);

  L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 8,
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.7
  }).addTo(rideLayer).bindPopup(`Dropoff: ${displayLocation(ride.dropoff)}`);

  L.polyline([
    [ride.pickup.lat, ride.pickup.lng],
    [ride.dropoff.lat, ride.dropoff.lng]
  ], { color: '#7c3aed', weight: 2, dashArray: '5, 10' }).addTo(rideLayer);
}

requestBtn.addEventListener('click', async function () {
  if (!pickupMarker || !dropoffMarker) return;

  const rideData = {
    pickup: {
      lat: pickupMarker.getLatLng().lat,
      lng: pickupMarker.getLatLng().lng,
      address: pickupAddress
    },
    dropoff: {
      lat: dropoffMarker.getLatLng().lat,
      lng: dropoffMarker.getLatLng().lng,
      address: dropoffAddress
    }
  };

  try {
    await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rideData)
    });
    resetMarkers();
    loadRides();
  } catch (err) {
    console.error('Error requesting ride:', err);
  }
});

async function loadRides() {
  try {
    const response = await fetch('/api/rides');
    allRides = await response.json();
    renderRides();
    rideLayer.clearLayers();
    allRides.forEach(addRideToMap);
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

loadRides();
setInterval(loadRides, 5000);