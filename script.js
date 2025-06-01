/* script.js */

// DOM elemek referenciái
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const dashboardSection = document.getElementById('dashboard-section');
const navLogin = document.getElementById('nav-login');
const navRegister = document.getElementById('nav-register');
const navDashboard = document.getElementById('nav-dashboard');
const navLogout = document.getElementById('nav-logout');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const deckForm = document.getElementById('deck-form');
const cardForm = document.getElementById('card-form');

let currentDeckId = null;
let currentCard = null;

// Szekciók váltása
function showSection(section) {
  loginSection.style.display = 'none';
  registerSection.style.display = 'none';
  dashboardSection.style.display = 'none';
  section.style.display = 'block';
}

// Ellenőrzi a felhasználói autentikációt és megjeleníti a megfelelő navigációs gombokat
function checkAuth() {
  const token = localStorage.getItem('token');
  if (token) {
    navDashboard.style.display = 'inline-block';
    navLogout.style.display = 'inline-block';
    navLogin.style.display = 'none';
    navRegister.style.display = 'none';
    loadDashboard();
  } else {
    navDashboard.style.display = 'none';
    navLogout.style.display = 'none';
    navLogin.style.display = 'inline-block';
    navRegister.style.display = 'inline-block';
    showSection(loginSection);
  }
}

// Regisztráció kezelése
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password})
  });
  
  const data = await res.json();
  if (res.ok) {
    document.getElementById('register-message').innerText = 'Sikeres regisztráció! Most már bejelentkezhetsz.';
    registerForm.reset();
  } else {
    document.getElementById('register-message').innerText = data.message || 'Hiba történt a regisztráció során.';
  }
});

// Bejelentkezés kezelése
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password})
  });
  
  const data = await res.json();
  if (res.ok) {
    localStorage.setItem('token', data.token);
    loginForm.reset();
    checkAuth();
  } else {
    document.getElementById('login-message').innerText = data.message || 'Hiba a bejelentkezés során.';
  }
});

// Kijelentkezés
navLogout.addEventListener('click', () => {
  localStorage.removeItem('token');
  checkAuth();
});

// Navigációs gombok
navLogin.addEventListener('click', () => { showSection(loginSection); });
navRegister.addEventListener('click', () => { showSection(registerSection); });
navDashboard.addEventListener('click', () => { loadDashboard(); });

// Dashboard betöltése: kártyacsomag, statisztikák, stb.
async function loadDashboard() {
  showSection(dashboardSection);
  loadDecks();
  loadStatistics();
  document.getElementById('card-list').innerHTML = '';
}

// Kártyacsomagok betöltése
async function loadDecks() {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/decks', {
    headers: {'Authorization': 'Bearer ' + token}
  });
  const decks = await res.json();
  const deckList = document.getElementById('deck-list');
  deckList.innerHTML = '';
  
  decks.forEach(deck => {
    const deckDiv = document.createElement('div');
    deckDiv.className = 'deck';
    deckDiv.innerHTML = `<strong>${deck.name}</strong><p>${deck.description}</p>`;
    deckDiv.addEventListener('click', () => {
      currentDeckId = deck.id;
      loadCards(deck.id);
    });
    const delBtn = document.createElement('button');
    delBtn.innerText = 'Törlés';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetch('/api/decks/' + deck.id, {
        method: 'DELETE',
        headers: {'Authorization': 'Bearer ' + token}
      });
      loadDecks();
    });
    deckDiv.appendChild(delBtn);
    deckList.appendChild(deckDiv);
  });
}

// Új deck létrehozása
deckForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('deck-name').value;
  const description = document.getElementById('deck-desc').value;
  const token = localStorage.getItem('token');
  
  const res = await fetch('/api/decks', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify({name, description})
  });
  if (res.ok) {
    deckForm.reset();
    loadDecks();
  }
});

// Kártyák betöltése egy deckből
async function loadCards(deckId) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/decks/${deckId}/cards`, {
    headers: {'Authorization': 'Bearer ' + token}
  });
  const cards = await res.json();
  const cardList = document.getElementById('card-list');
  cardList.innerHTML = '';
  
  cards.forEach(card => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.innerHTML = `<strong>Q:</strong> ${card.question} <br> <strong>A:</strong> ${card.answer}`;
    const delBtn = document.createElement('button');
    delBtn.innerText = 'Törlés';
    delBtn.addEventListener('click', async () => {
      await fetch(`/api/decks/${deckId}/cards/${card.id}`, {
        method: 'DELETE',
        headers: {'Authorization': 'Bearer ' + token}
      });
      loadCards(deckId);
    });
    cardDiv.appendChild(delBtn);
    cardList.appendChild(cardDiv);
  });
}

// Új kártya létrehozása
cardForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentDeckId) {
    alert("Kérlek válassz előbb egy kártyacsomagot!");
    return;
  }
  
  const question = document.getElementById('card-question').value;
  const answer = document.getElementById('card-answer').value;
  const token = localStorage.getItem('token');
  
  const res = await fetch(`/api/decks/${currentDeckId}/cards`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify({question, answer})
  });
  if (res.ok) {
    cardForm.reset();
    loadCards(currentDeckId);
  }
});

// Statisztikák betöltése
async function loadStatistics() {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/statistics', {
    headers: {'Authorization': 'Bearer ' + token}
  });
  const stats = await res.json();
  const statsInfo = document.getElementById('stats-info');
  statsInfo.innerText = `Sikerarány: ${stats.successRate}%\nTanulási aktivitás: ${stats.studyCount} alkalom`;
}

document.getElementById('refresh-stats').addEventListener('click', loadStatistics);

// Tanulási mód
document.getElementById('start-study').addEventListener('click', async function() {
  if (!currentDeckId) {
    alert("Kérlek válassz előbb egy kártyacsomagot a tanuláshoz!");
    return;
  }
  startStudy();
});

async function startStudy() {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/decks/${currentDeckId}/study`, {
    headers: {'Authorization': 'Bearer ' + token}
  });
  if (!res.ok) {
    alert("Nincs kártya a tanuláshoz.");
    return;
  }
  const card = await res.json();
  currentCard = card;
  document.getElementById('study-question').innerText = card.question;
  document.getElementById('study-answer').style.display = 'none';
  document.getElementById('study-feedback').style.display = 'none';
  document.getElementById('study-card').style.display = 'block';
}

document.getElementById('show-answer').addEventListener('click', function() {
  document.getElementById('study-answer').innerText = currentCard.answer;
  document.getElementById('study-answer').style.display = 'block';
  document.getElementById('study-feedback').style.display = 'block';
});

document.getElementById('knew-btn').addEventListener('click', function() {
  submitStudyResult(true);
});
document.getElementById('not-knew-btn').addEventListener('click', function() {
  submitStudyResult(false);
});

async function submitStudyResult(correct) {
  const token = localStorage.getItem('token');
  await fetch(`/api/decks/${currentDeckId}/study/${currentCard.id}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify({ correct })
  });
  startStudy();
}

// Inicializálás
checkAuth();
