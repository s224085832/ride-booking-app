const driverRides = document.getElementById('driver-rides');
const nameInput = document.getElementById('driver-name-input');
const carInput = document.getElementById('car-type-input');
const carRegInput = document.getElementById('car-reg-input');
const carColourInput = document.getElementById('car-colour-input');
const saveBtn = document.getElementById('save-profile-btn');
const profileStatus = document.getElementById('profile-status');
const tabActive = document.getElementById('tab-active');
const tabHistory = document.getElementById('tab-history');
const driverSubtitle = document.getElementById('driver-subtitle');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const driverStats = document.getElementById('driver-stats');

const pickupMapSection = document.getElementById('pickup-map-section');
const pickupDistanceEl = document.getElementById('pickup-distance');

const chatModal = document.getElementById('chat-modal');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
let activeChatRideId = null;
let chatPollTimer = null;
const CHAT_ROLE = 'driver';

// Require a driver login before using this page
const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
if (!currentUser || currentUser.role !== 'driver') {
  window.location.href = 'index.html';
}

if (currentUser && !localStorage.getItem('driverName')) {
  localStorage.setItem('driverName', currentUser.name);
}

function loadProfile() {
  const name = localStorage.getItem('driverName') || '';
  const car = localStorage.getItem('carType') || '';
  const reg = localStorage.getItem('carReg') || '';
  const colour = localStorage.getItem('carColour') || '';
  nameInput.value = name;
  carInput.value = car;
  carRegInput.value = reg;
  carColourInput.value = colour;
  profileStatus.textContent = name
    ? `Driving as ${name}${car ? ' — ' + car : ''}`
    : 'Set your name and car details before accepting rides';
}

saveBtn.addEventListener('click', function () {
  localStorage.setItem('driverName', nameInput.value.trim());
  localStorage.setItem('carType', carInput.value.trim());
  localStorage.setItem('carReg', carRegInput.value.trim());
  localStorage.setItem('carColour', carColourInput.value.trim());
  loadProfile();
  loadStats();
});

loadProfile();

userInfo.textContent = currentUser ? `Hi, ${currentUser.name}` : '';

logoutBtn.addEventListener('click', function () {
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
});

// ----- Stats -----
async function loadStats() {
  const driverName = localStorage.getItem('driverName');
  if (!driverName) {
    driverStats.innerHTML = '';
    return;
  }
  try {
    const response = await fetch(`/api/stats?role=driver&name=${encodeURIComponent(driverName)}`);
    const stats = await response.json();
    const ratingText = stats.avgRating != null
      ? `${'★'.repeat(Math.round(stats.avgRating))}${'☆'.repeat(5 - Math.round(stats.avgRating))} ${stats.avgRating} (${stats.ratedCount} rated)`
      : 'No ratings yet';
    driverStats.innerHTML = `
      <span>${stats.totalRides} ride${stats.totalRides === 1 ? '' : 's'} completed</span>
      <span>${ratingText}</span>
    `;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

loadStats();

// ----- Chat -----
function openChat(rideId) {
  activeChatRideId = rideId;
  chatModal.classList.remove('hidden');
  loadChatMessages();
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(loadChatMessages, 4000);
}

function closeChat() {
  chatModal.classList.add('hidden');
  activeChatRideId = null;
  if (chatPollTimer) clearInterval(chatPollTimer);
}

chatCloseBtn.addEventListener('click', closeChat);

function getChatSeen() {
  return JSON.parse(localStorage.getItem('chatSeen') || '{}');
}

function setChatSeenCount(rideId, count) {
  const seen = getChatSeen();
  seen[rideId] = count;
  localStorage.setItem('chatSeen', JSON.stringify(seen));
}

function getUnreadCount(ride) {
  const seen = getChatSeen();
  const seenCount = seen[ride._id] || 0;
  const otherMessages = (ride.messages || []).filter(m => m.sender !== CHAT_ROLE);
  return Math.max(0, otherMessages.length - seenCount);
}

async function loadChatMessages() {
  if (!activeChatRideId) return;
  try {
    const response = await fetch(`/api/rides/${activeChatRideId}/messages`);
    const messages = await response.json();
    chatMessages.innerHTML = '';
    if (messages.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-hint';
      empty.textContent = 'Say hello to your rider!';
      chatMessages.appendChild(empty);
    } else {
      messages.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${msg.sender === 'driver' ? 'self' : 'other'}`;
        bubble.innerHTML = `<span class="chat-sender">${msg.senderName || msg.sender}</span>${msg.text}`;
        chatMessages.appendChild(bubble);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    const otherCount = messages.filter(m => m.sender !== CHAT_ROLE).length;
    setChatSeenCount(activeChatRideId, otherCount);
    renderRides();
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !activeChatRideId) return;
  chatInput.value = '';
  const driverName = localStorage.getItem('driverName') || 'Driver';
  try {
    await fetch(`/api/rides/${activeChatRideId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'driver', senderName: driverName, text })
    });
    loadChatMessages();
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') sendChatMessage();
});

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

function displayLocation(point) {
  return point.address || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

// ----- Distance / routing helpers (mirrors app.js) -----
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

async function fetchRoadRoute(points) {
  const coordsParam = points.map(p => `${p.lng},${p.lat}`).join(';');
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`
    );
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
      throw new Error('No route found');
    }
    const route = data.routes[0];
    return {
      latlngs: route.geometry.coordinates.map(c => [c[1], c[0]]),
      distanceKm: route.distance / 1000
    };
  } catch (err) {
    return {
      latlngs: points.map(p => [p.lat, p.lng]),
      distanceKm: getDistanceKm(points[0], points[points.length - 1])
    };
  }
}

// ----- Pickup map (driver location -> assigned rider's pickup) -----
let pickupMap = null;
let pickupMapLayer = null;
let driverLatLng = null;

const driverIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const riderIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

function ensurePickupMap() {
  if (pickupMap) return;
  pickupMap = L.map('pickup-map').setView([-33.9608, 25.6022], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(pickupMap);
  pickupMapLayer = L.layerGroup().addTo(pickupMap);
}

function locateDriver() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function (pos) {
    driverLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    updatePickupMap();
  }, function () {
    // Location unavailable; pickup map just won't show driver's position
  });
}

async function updatePickupMap() {
  const myRide = allRides.find(r => r.status === 'accepted' && r.driverName === localStorage.getItem('driverName'));

  if (!myRide || !driverLatLng) {
    pickupMapSection.classList.add('hidden');
    return;
  }

  pickupMapSection.classList.remove('hidden');
  ensurePickupMap();
  pickupMapLayer.clearLayers();

  const riderPoint = { lat: myRide.pickup.lat, lng: myRide.pickup.lng };

  L.marker([driverLatLng.lat, driverLatLng.lng], { icon: driverIcon }).addTo(pickupMapLayer).bindPopup('You');
  L.marker([riderPoint.lat, riderPoint.lng], { icon: riderIcon }).addTo(pickupMapLayer).bindPopup(`Rider: ${displayLocation(myRide.pickup)}`);

  const { latlngs, distanceKm } = await fetchRoadRoute([driverLatLng, riderPoint]);
  L.polyline(latlngs, { color: '#00d4aa', weight: 4, opacity: 0.85 }).addTo(pickupMapLayer);
  pickupMap.fitBounds(latlngs, { padding: [30, 30] });
  setTimeout(() => pickupMap.invalidateSize(), 150);

  pickupDistanceEl.textContent = `~${distanceKm.toFixed(1)} km to ${myRide.riderName || 'rider'}`;
}

locateDriver();
setInterval(locateDriver, 15000);

let allRides = [];
let currentView = 'active';

tabActive.addEventListener('click', function () {
  currentView = 'active';
  tabActive.classList.add('active');
  tabHistory.classList.remove('active');
  driverSubtitle.textContent = 'Pending rides will appear below. Accept or complete them.';
  renderRides();
});

tabHistory.addEventListener('click', function () {
  currentView = 'history';
  tabHistory.classList.add('active');
  tabActive.classList.remove('active');
  driverSubtitle.textContent = 'Rides you completed, and rides riders cancelled.';
  renderRides();
});

function renderRides() {
  const filtered = allRides.filter(ride => {
    if (currentView === 'active') return ride.status !== 'completed' && ride.status !== 'cancelled';
    return ride.status === 'completed' || ride.status === 'cancelled';
  });

  if (filtered.length === 0) {
    driverRides.innerHTML = `<p class="no-rides">${currentView === 'active' ? 'No rides available right now.' : 'No ride history yet.'}</p>`;
    return;
  }

  driverRides.innerHTML = '';
  filtered.forEach(ride => {
    const card = document.createElement('div');
    card.className = 'ride-card';
    card.innerHTML = `
      <div class="coords">
        <strong>Pickup:</strong> ${displayLocation(ride.pickup)}<br>
        <strong>Dropoff:</strong> ${displayLocation(ride.dropoff)}<br>
        ${ride.fare != null ? `<strong>Fare:</strong> R${ride.fare.toFixed(2)}<br>` : ''}
        ${ride.status !== 'cancelled' ? `<strong>Payment:</strong> ${ride.paymentMethod === 'card' ? `💳 Card${ride.cardLast4 ? ' •••• ' + ride.cardLast4 : ''}` : '💵 Cash'} — ${ride.paymentStatus === 'paid' ? 'Paid' : 'Collect on completion'}<br>` : ''}
        ${ride.status === 'cancelled' && ride.cancelReason ? `<strong>Cancelled:</strong> ${ride.cancelReason}<br>` : ''}
        ${ride.status === 'completed' && ride.rating ? `<strong>Rating:</strong> ${'★'.repeat(ride.rating)}${'☆'.repeat(5 - ride.rating)}<br>` : ''}
        <span class="timestamp">${timeAgo(ride.createdAt)}</span>
      </div>
      <span class="status ${ride.status}">${ride.status}</span>
      ${ride.driverName ? `<div class="driver-info">Assigned: ${ride.driverName} (${ride.carType || 'n/a'})${ride.carReg ? ' — ' + ride.carReg : ''}${ride.carColour ? ', ' + ride.carColour : ''}</div>` : ''}
      ${ride.status === 'pending' ? `<button class="accept-btn" onclick="acceptRide('${ride._id}')">Accept</button>` : ''}
      ${ride.status === 'accepted' ? `<button class="complete-btn" onclick="updateRide('${ride._id}', 'completed')">Complete</button>
      <button class="chat-btn" onclick="openChat('${ride._id}')">💬 Chat${getUnreadCount(ride) > 0 ? ` <span class="chat-badge">${getUnreadCount(ride)}</span>` : ''}</button>` : ''}
    `;
    driverRides.appendChild(card);
  });
}

async function loadPendingRides() {
  try {
    const response = await fetch('/api/rides');
    allRides = await response.json();
    renderRides();
    updatePickupMap();
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

async function acceptRide(id) {
  const driverName = localStorage.getItem('driverName');
  const carType = localStorage.getItem('carType');
  const carReg = localStorage.getItem('carReg');
  const carColour = localStorage.getItem('carColour');
  if (!driverName) {
    alert('Please set your name (and car details) above before accepting a ride.');
    return;
  }
  try {
    await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted', driverName, carType, carReg, carColour })
    });
    loadPendingRides();
  } catch (err) {
    console.error('Error accepting ride:', err);
  }
}

async function updateRide(id, status) {
  try {
    await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadPendingRides();
    if (status === 'completed') loadStats();
  } catch (err) {
    console.error('Error updating ride:', err);
  }
}

loadPendingRides();
setInterval(loadPendingRides, 5000);