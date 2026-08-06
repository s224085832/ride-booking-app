// Mock user accounts — for demo purposes only, not real authentication.
// Passwords are stored in plain text here on purpose since this is a mock login,
// never do this for a real app.
const MOCK_ACCOUNTS = [
  { username: 'rider1', password: 'rider123', role: 'rider', name: 'Alex' },
  { username: 'rider2', password: 'rider123', role: 'rider', name: 'Sam' },
  { username: 'driver1', password: 'driver123', role: 'driver', name: 'Maxwell' },
  { username: 'driver2', password: 'driver123', role: 'driver', name: 'Jordan' }
];

// Accounts created via the sign-up form, stored in localStorage so they persist
function getCustomAccounts() {
  return JSON.parse(localStorage.getItem('customAccounts') || '[]');
}

function saveCustomAccounts(accounts) {
  localStorage.setItem('customAccounts', JSON.stringify(accounts));
}

function getAllAccounts() {
  return [...MOCK_ACCOUNTS, ...getCustomAccounts()];
}

// DOM references
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const signupNameInput = document.getElementById('signup-name-input');
const signupUsernameInput = document.getElementById('signup-username-input');
const signupPasswordInput = document.getElementById('signup-password-input');
const errorMsg = document.getElementById('form-error');
const formSubtitle = document.getElementById('form-subtitle');
const showSignup = document.getElementById('show-signup');
const showLogin = document.getElementById('show-login');
const roleButtons = document.querySelectorAll('.role-btn');

let selectedRole = 'rider';

// If already logged in, skip straight to the right page
const existing = JSON.parse(localStorage.getItem('currentUser') || 'null');
if (existing) {
  window.location.href = existing.role === 'driver' ? 'driver.html' : 'ride.html';
}

// Toggle between login and sign-up views
showSignup.addEventListener('click', function (e) {
  e.preventDefault();
  loginForm.classList.add('hidden');
  signupForm.classList.remove('hidden');
  showSignup.classList.add('hidden');
  showLogin.classList.remove('hidden');
  formSubtitle.textContent = 'Create your account';
  errorMsg.textContent = '';
});

showLogin.addEventListener('click', function (e) {
  e.preventDefault();
  signupForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  showLogin.classList.add('hidden');
  showSignup.classList.remove('hidden');
  formSubtitle.textContent = 'Sign in to continue';
  errorMsg.textContent = '';
});

// Rider / Driver role selector on the sign-up form
roleButtons.forEach(btn => {
  btn.addEventListener('click', function () {
    roleButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRole = btn.dataset.role;
  });
});

// Handle login
loginForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  const account = getAllAccounts().find(a => a.username === username && a.password === password);

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

// Handle sign-up
signupForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const name = signupNameInput.value.trim();
  const username = signupUsernameInput.value.trim();
  const password = signupPasswordInput.value;

  if (!name || !username || !password) {
    errorMsg.textContent = 'Please fill in all fields.';
    return;
  }

  const taken = getAllAccounts().some(a => a.username === username);
  if (taken) {
    errorMsg.textContent = 'That username is already taken.';
    return;
  }

  const newAccount = { username, password, role: selectedRole, name };
  const customAccounts = getCustomAccounts();
  customAccounts.push(newAccount);
  saveCustomAccounts(customAccounts);

  localStorage.setItem('currentUser', JSON.stringify({
    username: newAccount.username,
    role: newAccount.role,
    name: newAccount.name
  }));

  window.location.href = newAccount.role === 'driver' ? 'driver.html' : 'ride.html';
});