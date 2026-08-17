const driverRides = document.getElementById('driver-rides');
const nameInput = document.getElementById('driver-name-input');
const carInput = document.getElementById('car-type-input');
const saveBtn = document.getElementById('save-profile-btn');
const profileStatus = document.getElementById('profile-status');
const tabActive = document.getElementById('tab-active');
const tabHistory = document.getElementById('tab-history');
const driverSubtitle = document.getElementById('driver-subtitle');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

const chatModal = document.getElementById('chat-modal');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
let activeChatRideId = null;
let chatPollTimer = null;
const CHAT_ROLE = 'driver';

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

// Require a driver login before using this page
const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
if (!currentUser || currentUser.role !== 'driver') {
  window.location.href = 'index.html';
}

// Pre-fill the driver's name from their login if they haven't set a profile yet
if (currentUser && !localStorage.getItem('driverName')) {
  localStorage.setItem('driverName', currentUser.name);
}

function loadProfile() {
  const name = localStorage.getItem('driverName') || '';
  const car = localStorage.getItem('carType') || '';
  nameInput.value = name;
  carInput.value = car;
  profileStatus.textContent = name
    ? `Driving as ${name}${car ? ' — ' + car : ''}`
    : 'Set your name (and car type) before accepting rides';
}

saveBtn.addEventListener('click', function () {
  localStorage.setItem('driverName', nameInput.value.trim());
  localStorage.setItem('carType', carInput.value.trim());
  loadProfile();
});

loadProfile();

userInfo.textContent = currentUser ? `Hi, ${currentUser.name}` : '';

logoutBtn.addEventListener('click', function () {
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
});

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

    // Mark messages from the rider as seen while the chat is open
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
        ${ride.fare != null ? `<strong>Fare:</strong> R${ride.fare.toFixed(2)}<br>` : ''}
        ${ride.status !== 'cancelled' ? `<strong>Payment:</strong> ${ride.paymentMethod === 'card' ? `💳 Card${ride.cardLast4 ? ' •••• ' + ride.cardLast4 : ''}` : '💵 Cash'} — ${ride.paymentStatus === 'paid' ? 'Paid' : 'Collect on completion'}<br>` : ''}
        ${ride.status === 'cancelled' && ride.cancelReason ? `<strong>Cancelled:</strong> ${ride.cancelReason}<br>` : ''}
        ${ride.status === 'completed' && ride.rating ? `<strong>Rating:</strong> ${'★'.repeat(ride.rating)}${'☆'.repeat(5 - ride.rating)}<br>` : ''}
        <span class="timestamp">${timeAgo(ride.createdAt)}</span>
      </div>
      <span class="status ${ride.status}">${ride.status}</span>
      ${ride.driverName ? `<div class="driver-info">Assigned: ${ride.driverName} (${ride.carType || 'n/a'})</div>` : ''}
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
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

async function acceptRide(id) {
  const driverName = localStorage.getItem('driverName');
  const carType = localStorage.getItem('carType');
  if (!driverName) {
    alert('Please set your name (and car type) above before accepting a ride.');
    return;
  }
  try {
    await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted', driverName, carType })
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
  } catch (err) {
    console.error('Error updating ride:', err);
  }
}

loadPendingRides();
setInterval(loadPendingRides, 5000);