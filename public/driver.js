// Require a driver login before using this page
const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
if (!currentUser || currentUser.role !== 'driver') {
  window.location.href = 'index.html';
}
const driverRides = document.getElementById('driver-rides');
const nameInput = document.getElementById('driver-name-input');
const carInput = document.getElementById('car-type-input');
const saveBtn = document.getElementById('save-profile-btn');
const profileStatus = document.getElementById('profile-status');

// Load saved driver profile (name + car type) from localStorage
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

// Pre-fill the driver's name from their login if they haven't set a profile yet
if (currentUser && !localStorage.getItem('driverName')) {
  localStorage.setItem('driverName', currentUser.name);
}

loadProfile();

const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

userInfo.textContent = currentUser ? `Hi, ${currentUser.name}` : '';

logoutBtn.addEventListener('click', function () {
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
});

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

// Fall back to coordinates if no address was resolved
function displayLocation(point) {
  return point.address || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

async function loadPendingRides() {
  try {
    const response = await fetch('/api/rides');
    const rides = await response.json();
    const activeRides = rides.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
    if (activeRides.length === 0) {
      driverRides.innerHTML = '<p class="no-rides">No rides available right now.</p>';
      return;
    }
    driverRides.innerHTML = '';
    activeRides.forEach(ride => {
      const card = document.createElement('div');
      card.className = 'ride-card';
      card.innerHTML = `
        <div class="coords">
          <strong>Pickup:</strong> ${displayLocation(ride.pickup)}<br>
          <strong>Dropoff:</strong> ${displayLocation(ride.dropoff)}<br>
          ${ride.fare != null ? `<strong>Fare:</strong> $${ride.fare.toFixed(2)}<br>` : ''}
          <span class="timestamp">${timeAgo(ride.createdAt)}</span>
        </div>
        <span class="status ${ride.status}">${ride.status}</span>
        ${ride.driverName ? `<div class="driver-info">Assigned: ${ride.driverName} (${ride.carType || 'n/a'})</div>` : ''}
        ${ride.status === 'pending' ? `<button class="accept-btn" onclick="acceptRide('${ride._id}')">Accept</button>` : ''}
        ${ride.status === 'accepted' ? `<button class="complete-btn" onclick="updateRide('${ride._id}', 'completed')">Complete</button>` : ''}
      `;
      driverRides.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

// Accept a ride, attaching the driver's saved name and car type
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