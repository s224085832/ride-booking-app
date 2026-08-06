const MOCK_ACCOUNTS = [
  { username: 'rider1', password: 'rider123', role: 'rider', name: 'Alex' },
  { username: 'rider2', password: 'rider123', role: 'rider', name: 'Sam' },
  { username: 'driver1', password: 'driver123', role: 'driver', name: 'Maxwell' },
  { username: 'driver2', password: 'driver123', role: 'driver', name: 'Jordan' }
];

function getCustomAccounts() {
  return JSON.parse(localStorage.getItem('customAccounts') || '[]');
}

function saveCustomAccounts(accounts) {
  localStorage.setItem('customAccounts', JSON.stringify(accounts));
}

function getAllAccounts() {
  return [...MOCK_ACCOUNTS, ...getCustomAccounts()];
}

const signupForm = document.getElementById('signup-form');
const nameInput = document.getElementById('signup-name-input');
const usernameInput = document.getElementById('signup-username-input');
const passwordInput = document.getElementById('signup-password-input');
const errorMsg = document.getElementById('form-error');
const roleButtons = document.querySelectorAll('.role-btn');

let selectedRole = 'rider';

roleButtons.forEach(btn => {
  btn.addEventListener('click', function () {
    roleButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRole = btn.dataset.role;
  });
});

signupForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const name = nameInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

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