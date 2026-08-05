// Mock user accounts — for demo purposes only, not real authentication.
// Passwords are stored in plain text here on purpose since this is a mock login,
// never do this for a real app.
const MOCK_ACCOUNTS = [
  { username: 'rider1', password: 'rider123', role: 'rider', name: 'Alex' },
  { username: 'rider2', password: 'rider123', role: 'rider', name: 'Sam' },
  { username: 'driver1', password: 'driver123', role: 'driver', name: 'Maxwell' },
  { username: 'driver2', password: 'driver123', role: 'driver', name: 'Jordan' }
];

const form = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const errorMsg = document.getElementById('login-error');

// If already logged in, skip straight to the right page
const existing = JSON.parse(localStorage.getItem('currentUser') || 'null');
if (existing) {
  window.location.href = existing.role === 'driver' ? 'driver.html' : 'ride.html';
}

form.addEventListener('submit', function (e) {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  const account = MOCK_ACCOUNTS.find(a => a.username === username && a.password === password);

  if (!account) {
    errorMsg.textContent = 'Invalid username or password.';
    return;
  }

  localStorage.setItem('currentUser', JSON.stringify({
    username: account.username,
    role: account.role,
    name: account.name
  }));

  window.location.href = account.role === 'driver' ? 'driver.html' : 'ride.html';
});