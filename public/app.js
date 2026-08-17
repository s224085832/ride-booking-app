// Require a rider login before using this page
const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
if (!currentUser || currentUser.role !== 'rider') {
  window.location.href = 'index.html';
}

// Initialize the map — defaults to Port Elizabeth (Gqeberha), then recenters on the rider's real location if granted
const map = L.map('map').setView([-33.9608, 25.6022], 12);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

const rideLayer = L.layerGroup().addTo(map);
const draftLayer = L.layerGroup().addTo(map);
const routeCache = new Map();

let userLocationMarker = null;

function locateUser() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function (pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    map.setView([lat, lng], 14);
    if (userLocationMarker) map.removeLayer(userLocationMarker);
    userLocationMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: '#4285f4',
      fillColor: '#4285f4',
      fillOpacity: 0.9,
      weight: 3
    }).addTo(map).bindPopup('You are here');
  }, function () {
    // Keep the Port Elizabeth default view if location access is denied
  });
}

locateUser();

// DOM references
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const pickupInput = document.getElementById('pickup-input');
const dropoffInput = document.getElementById('dropoff-input');
const pickupSuggestions = document.getElementById('pickup-suggestions');
const dropoffSuggestions = document.getElementById('dropoff-suggestions');
const useLocationBtn = document.getElementById('use-location-btn');
const stopsContainer = document.getElementById('stops-container');
const addStopBtn = document.getElementById('add-stop-btn');
const rideControls = document.getElementById('ride-controls');
const fareEstimate = document.getElementById('fare-estimate');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const searchError = document.getElementById('search-error');

const paymentButtons = document.querySelectorAll('.payment-btn');
const cardFields = document.getElementById('card-fields');
const cardNumberInput = document.getElementById('card-number-input');
const cardExpiryInput = document.getElementById('card-expiry-input');
const cardCvvInput = document.getElementById('card-cvv-input');
let selectedPaymentMethod = 'cash';

paymentButtons.forEach(btn => {
  btn.addEventListener('click', function () {
    paymentButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedPaymentMethod = btn.dataset.method;
    cardFields.classList.toggle('hidden', selectedPaymentMethod !== 'card');
  });
});

// Auto-space card number as the rider types, purely cosmetic
cardNumberInput.addEventListener('input', function () {
  let digits = cardNumberInput.value.replace(/\D/g, '').slice(0, 16);
  cardNumberInput.value = digits.replace(/(.{4})/g, '$1 ').trim();
});

cardExpiryInput.addEventListener('input', function () {
  let digits = cardExpiryInput.value.replace(/\D/g, '').slice(0, 4);
  if (digits.length > 2) digits = digits.slice(0, 2) + '/' + digits.slice(2);
  cardExpiryInput.value = digits;
});

cardCvvInput.addEventListener('input', function () {
  cardCvvInput.value = cardCvvInput.value.replace(/\D/g, '').slice(0, 3);
});

const activeRidesList = document.getElementById('active-rides-list');
const historyRidesList = document.getElementById('history-rides-list');

const historyToggleBtn = document.getElementById('history-toggle-btn');
const closeHistoryBtn = document.getElementById('close-history-btn');
const bookingView = document.getElementById('booking-view');
const historyPanel = document.getElementById('history-panel');

const cancelModal = document.getElementById('cancel-modal');
const cancelReasonSelect = document.getElementById('cancel-reason-select');
const cancelModalBackBtn = document.getElementById('cancel-modal-back-btn');
const cancelModalConfirmBtn = document.getElementById('cancel-modal-confirm-btn');
const cancelModalError = document.getElementById('cancel-modal-error');
let rideIdPendingCancellation = null;

const chatModal = document.getElementById('chat-modal');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
let activeChatRideId = null;
let chatPollTimer = null;
const CHAT_ROLE = 'rider';

// ----- Unread message tracking (per ride, stored locally) -----
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

userInfo.textContent = currentUser ? `Hi, ${currentUser.name}` : '';

logoutBtn.addEventListener('click', function () {
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
});

historyToggleBtn.addEventListener('click', function () {
  bookingView.classList.add('hidden');
  historyPanel.classList.remove('hidden');
});

closeHistoryBtn.addEventListener('click', function () {
  historyPanel.classList.add('hidden');
  bookingView.classList.remove('hidden');
});

// ----- Cancel-reason modal -----
function openCancelModal(id) {
  rideIdPendingCancellation = id;
  cancelReasonSelect.value = '';
  cancelModalError.textContent = '';
  cancelModal.classList.remove('hidden');
}

function closeCancelModal() {
  cancelModal.classList.add('hidden');
  rideIdPendingCancellation = null;
}

cancelModalBackBtn.addEventListener('click', closeCancelModal);

cancelModalConfirmBtn.addEventListener('click', async function () {
  const reason = cancelReasonSelect.value;
  if (!reason) {
    cancelModalError.textContent = 'Please select a reason.';
    return;
  }
  try {
    await fetch(`/api/rides/${rideIdPendingCancellation}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled', cancelReason: reason })
    });
    closeCancelModal();
    loadRides();
  } catch (err) {
    console.error('Error cancelling ride:', err);
    cancelModalError.textContent = 'Something went wrong. Try again.';
  }
});

// ----- Chat modal -----
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

async function loadChatMessages() {
  if (!activeChatRideId) return;
  try {
    const response = await fetch(`/api/rides/${activeChatRideId}/messages`);
    const messages = await response.json();
    chatMessages.innerHTML = '';
    if (messages.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-hint';
      empty.textContent = 'Say hello to your driver!';
      chatMessages.appendChild(empty);
    } else {
      messages.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${msg.sender === 'rider' ? 'self' : 'other'}`;
        bubble.innerHTML = `<span class="chat-sender">${msg.senderName || msg.sender}</span>${msg.text}`;
        chatMessages.appendChild(bubble);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Mark messages from the driver as seen while the chat is open
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
  try {
    await fetch(`/api/rides/${activeChatRideId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'rider', senderName: currentUser.name, text })
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

// ----- Rating -----
async function rateRide(id, stars) {
  try {
    await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: stars })
    });
    loadRides();
  } catch (err) {
    console.error('Error submitting rating:', err);
  }
}

// Icons
const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const blueIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// ----- Distance / fare helpers -----
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

function straightLineKm(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += getDistanceKm(points[i], points[i + 1]);
  return total;
}

function fareFromDistance(distanceKm) {
  const BASE_FARE = 15;
  const PER_KM_RATE = 8;
  return Math.round((BASE_FARE + distanceKm * PER_KM_RATE) * 100) / 100;
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
    console.error('Routing unavailable, falling back to a straight line:', err);
    return {
      latlngs: points.map(p => [p.lat, p.lng]),
      distanceKm: straightLineKm(points)
    };
  }
}

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

function shortenAddress(fullAddress) {
  if (!fullAddress) return null;
  const parts = fullAddress.split(',').map(p => p.trim());
  return parts.slice(0, 3).join(', ');
}

// ----- Address search (via server proxy, South Africa only) -----
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

async function searchAddress(query) {
  if (!query || query.length < 3) return [];
  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error searching address:', err);
    return [];
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    );
    const data = await response.json();
    return data.display_name || null;
  } catch (err) {
    console.error('Error reverse geocoding:', err);
    return null;
  }
}

function setupAutocomplete(inputEl, suggestionsEl, onSelect) {
  const runSearch = debounce(async function () {
    const query = inputEl.value.trim();
    const results = await searchAddress(query);
    suggestionsEl.innerHTML = '';
    results.forEach(result => {
      const li = document.createElement('li');
      li.textContent = shortenAddress(result.display_name);
      li.addEventListener('click', function () {
        inputEl.value = shortenAddress(result.display_name);
        suggestionsEl.innerHTML = '';
        onSelect({
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
          address: shortenAddress(result.display_name)
        });
        debouncedUpdateDraft();
      });
      suggestionsEl.appendChild(li);
    });
  }, 400);

  inputEl.addEventListener('input', function () {
    onSelect(null);
    debouncedUpdateDraft();
    runSearch();
  });

  document.addEventListener('click', function (e) {
    if (e.target !== inputEl) suggestionsEl.innerHTML = '';
  });
}

// ----- Trip state -----
let pickupLocation = null;
let dropoffLocation = null;
let stops = [];

setupAutocomplete(pickupInput, pickupSuggestions, function (location) {
  pickupLocation = location;
});

setupAutocomplete(dropoffInput, dropoffSuggestions, function (location) {
  dropoffLocation = location;
});

useLocationBtn.addEventListener('click', function () {
  if (!navigator.geolocation) {
    searchError.textContent = 'Location access is not available in this browser.';
    return;
  }
  searchError.textContent = 'Locating you...';
  navigator.geolocation.getCurrentPosition(async function (pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const fullAddress = await reverseGeocode(lat, lng);
    const address = shortenAddress(fullAddress) || 'Current location';
    pickupInput.value = address;
    pickupLocation = { lat, lng, address };
    searchError.textContent = '';
    debouncedUpdateDraft();
  }, function () {
    searchError.textContent = 'Could not access your location.';
  });
});

// ----- Stops (add/remove) -----
addStopBtn.addEventListener('click', function () {
  const stopEntry = { location: null };

  const row = document.createElement('div');
  row.className = 'search-field stop-row';
  row.innerHTML = `
    <label>Stop</label>
    <div class="search-input-row">
      <input type="text" class="stop-input" placeholder="Enter a stop" autocomplete="off">
      <button type="button" class="remove-stop-btn" title="Remove stop">✕</button>
    </div>
    <ul class="suggestions stop-suggestions"></ul>
  `;
  stopsContainer.appendChild(row);

  const stopInput = row.querySelector('.stop-input');
  const stopSuggestions = row.querySelector('.stop-suggestions');
  const removeBtn = row.querySelector('.remove-stop-btn');

  setupAutocomplete(stopInput, stopSuggestions, function (location) {
    stopEntry.location = location;
  });

  removeBtn.addEventListener('click', function () {
    stops = stops.filter(s => s !== stopEntry);
    row.remove();
    debouncedUpdateDraft();
  });

  stopEntry.row = row;
  stops.push(stopEntry);
});

// ----- Draft route preview on the map -----
function getRoutePoints() {
  const points = [];
  if (pickupLocation) points.push(pickupLocation);
  stops.forEach(s => { if (s.location) points.push(s.location); });
  if (dropoffLocation) points.push(dropoffLocation);
  return points;
}

async function updateDraft() {
  draftLayer.clearLayers();
  const points = getRoutePoints();

  if (pickupLocation) {
    L.marker([pickupLocation.lat, pickupLocation.lng], { icon: greenIcon }).addTo(draftLayer).bindPopup('Pickup');
  }
  stops.forEach(s => {
    if (s.location) {
      L.marker([s.location.lat, s.location.lng], { icon: blueIcon }).addTo(draftLayer).bindPopup('Stop');
    }
  });
  if (dropoffLocation) {
    L.marker([dropoffLocation.lat, dropoffLocation.lng], { icon: redIcon }).addTo(draftLayer).bindPopup('Dropoff');
  }

  if (points.length >= 2) {
    const { latlngs, distanceKm } = await fetchRoadRoute(points);
    L.polyline(latlngs, { color: '#00d4aa', weight: 5, opacity: 0.85 }).addTo(draftLayer);
    map.fitBounds(latlngs, { padding: [40, 40] });

    if (pickupLocation && dropoffLocation) {
      const fare = fareFromDistance(distanceKm);
      fareEstimate.textContent = `Estimated fare: R${fare.toFixed(2)} (~${distanceKm.toFixed(1)} km)`;
      rideControls.classList.remove('hidden');
    }
  } else {
    rideControls.classList.add('hidden');
  }
}

const debouncedUpdateDraft = debounce(updateDraft, 500);

// ----- Reset the form -----
function resetMarkers() {
  pickupInput.value = '';
  dropoffInput.value = '';
  pickupLocation = null;
  dropoffLocation = null;
  stops.forEach(s => s.row.remove());
  stops = [];
  draftLayer.clearLayers();
  fareEstimate.textContent = '';
  searchError.textContent = '';
  rideControls.classList.add('hidden');

  paymentButtons.forEach(b => b.classList.remove('active'));
  document.querySelector('.payment-btn[data-method="cash"]').classList.add('active');
  selectedPaymentMethod = 'cash';
  cardFields.classList.add('hidden');
  cardNumberInput.value = '';
  cardExpiryInput.value = '';
  cardCvvInput.value = '';
}

resetBtn.addEventListener('click', resetMarkers);

// ----- Ride list rendering -----
let allRides = [];

function buildPaymentLine(ride) {
  if (ride.status === 'cancelled') return '';
  const methodLabel = ride.paymentMethod === 'card'
    ? `💳 Card${ride.cardLast4 ? ` •••• ${ride.cardLast4}` : ''}`
    : '💵 Cash';
  const statusLabel = ride.paymentStatus === 'paid' ? 'Paid' : 'Due on completion';
  return `<span class="driver-info">${methodLabel} — ${statusLabel}</span><br>`;
}

function addRideToList(ride, listEl) {
  const li = document.createElement('li');
  const viaText = ride.stops && ride.stops.length > 0
    ? `<br>Via: ${ride.stops.map(s => displayLocation(s)).join(' → ')}`
    : '';

  let ratingHtml = '';
  if (ride.status === 'completed') {
    if (ride.rating) {
      ratingHtml = `<div class="driver-info">Your rating: ${'★'.repeat(ride.rating)}${'☆'.repeat(5 - ride.rating)}</div>`;
    } else {
      ratingHtml = `<div class="star-rating">Rate this ride: ${[1, 2, 3, 4, 5].map(n =>
        `<span class="star" onclick="rateRide('${ride._id}', ${n})">★</span>`
      ).join('')}</div>`;
    }
  }

  li.innerHTML = `
    <span class="status ${ride.status}">${ride.status}</span>
    <span class="timestamp">${timeAgo(ride.createdAt)}</span><br>
    Pickup: ${displayLocation(ride.pickup)}${viaText}<br>
    Dropoff: ${displayLocation(ride.dropoff)}<br>
    ${ride.fare != null ? `Fare: R${ride.fare.toFixed(2)}<br>` : ''}
    ${buildPaymentLine(ride)}
    ${ride.driverName ? `<span class="driver-info">Driver: ${ride.driverName} (${ride.carType || 'car type not set'})</span><br>` : ''}
    ${ride.status === 'cancelled' && ride.cancelReason ? `<span class="driver-info">Reason: ${ride.cancelReason}</span><br>` : ''}
    ${ratingHtml}
    <div class="ride-card-actions">
      <div class="ride-card-actions">
      ${ride.status === 'accepted' ? `<button class="chat-btn" onclick="openChat('${ride._id}')">💬 Chat${getUnreadCount(ride) > 0 ? ` <span class="chat-badge">${getUnreadCount(ride)}</span>` : ''}</button>` : ''}
      ${ride.status === 'pending' || ride.status === 'accepted' ? `<button class="cancel-btn" onclick="openCancelModal('${ride._id}')">Cancel</button>` : ''}
    </div>
  `;
  listEl.appendChild(li);
}

function renderRides() {
  const active = allRides.filter(r => r.status === 'pending' || r.status === 'accepted');
  const history = allRides.filter(r => r.status === 'completed' || r.status === 'cancelled');

  activeRidesList.innerHTML = '';
  if (active.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.style.background = 'transparent';
    empty.style.border = 'none';
    empty.textContent = 'No active ride right now.';
    activeRidesList.appendChild(empty);
  } else {
    active.forEach(ride => addRideToList(ride, activeRidesList));
  }

  historyRidesList.innerHTML = '';
  if (history.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.style.background = 'transparent';
    empty.style.border = 'none';
    empty.textContent = 'No ride history yet.';
    historyRidesList.appendChild(empty);
  } else {
    history.forEach(ride => addRideToList(ride, historyRidesList));
  }
}

async function addRideToMap(ride) {
  if (ride.status !== 'pending' && ride.status !== 'accepted') return;

  const points = [ride.pickup, ...(ride.stops || []), ride.dropoff];

  L.marker([ride.pickup.lat, ride.pickup.lng], { icon: greenIcon }).addTo(rideLayer).bindPopup(`Pickup: ${displayLocation(ride.pickup)}`);
  (ride.stops || []).forEach(s => {
    L.marker([s.lat, s.lng], { icon: blueIcon }).addTo(rideLayer).bindPopup(`Stop: ${displayLocation(s)}`);
  });
  L.marker([ride.dropoff.lat, ride.dropoff.lng], { icon: redIcon }).addTo(rideLayer).bindPopup(`Dropoff: ${displayLocation(ride.dropoff)}`);

  let latlngs;
  if (routeCache.has(ride._id)) {
    latlngs = routeCache.get(ride._id);
  } else {
    const result = await fetchRoadRoute(points);
    latlngs = result.latlngs;
    routeCache.set(ride._id, latlngs);
  }
  L.polyline(latlngs, { color: '#7c3aed', weight: 4, opacity: 0.8 }).addTo(rideLayer);
}

// ----- Request a ride -----
requestBtn.addEventListener('click', async function () {
  if (!pickupLocation || !dropoffLocation) return;

  if (selectedPaymentMethod === 'card') {
    const digits = cardNumberInput.value.replace(/\D/g, '');
    if (digits.length < 12 || !cardExpiryInput.value || cardCvvInput.value.length < 3) {
      searchError.textContent = 'Please fill in the card details (or switch to Cash).';
      return;
    }
  }

  const rideData = {
    pickup: { lat: pickupLocation.lat, lng: pickupLocation.lng, address: pickupLocation.address },
    dropoff: { lat: dropoffLocation.lat, lng: dropoffLocation.lng, address: dropoffLocation.address },
    stops: stops.filter(s => s.location).map(s => ({
      lat: s.location.lat, lng: s.location.lng, address: s.location.address
    })),
    paymentMethod: selectedPaymentMethod,
    cardLast4: selectedPaymentMethod === 'card' ? cardNumberInput.value.replace(/\D/g, '').slice(-4) : null
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