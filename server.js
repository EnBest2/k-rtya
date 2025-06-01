// Állítsd be, hogy a DNS lekérdezések alapértelmezetten IPv4 eredményt adjanak vissza.
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config(); // Környezeti változók betöltése a .env fájlból

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Supabase PostgreSQL kapcsolat Session poolerrel – a connection string a .env fájlból
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URI,
  ssl: { rejectUnauthorized: false },
  family: 4 // Kényszeríti az IPv4 használatát
});

app.use(express.json());
app.use(cors());

// Statikus fájlok kiszolgálása (például index.html, style.css, stb.)
app.use(express.static(path.join(__dirname)));

// Root route: index.html kiszolgálása
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * JWT autentikációs middleware.
 * A kliensnek az Authorization header-ben kell küldenie: "Bearer <token>" formában.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token hiányzik' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Érvénytelen token' });
    req.user = user;
    next();
  });
}

/* REGISZTRÁCIÓ: A felhasználói adatok mentése a Supabase adatbázisba */
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  console.log("Regisztrációs kérelem:", req.body);
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log("Lekérdezés eredménye:", result.rows);
    if (result.rows.length > 0) {
      return res.status(400).json({ message: 'E-mail már regisztrálva van' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Jelszó hash elkészítve:", hashedPassword);
    const insert = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );
    console.log("Insert eredménye:", insert.rows);
    res.status(201).json({ message: 'Sikeres regisztráció', user: insert.rows[0] });
  } catch (err) {
    console.error('Regisztráció hiba:', err);
    res.status(500).json({ message: 'Szerver hiba a regisztráció során', error: err.message });
  }
});

/* BEJELENTKEZÉS: Felhasználó hitelesítése és JWT token generálása */
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  console.log("Bejelentkezési kérelem:", req.body);
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log("Lekérdezés eredménye:", result.rows);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Érvénytelen hitelesítő adatok' });
    }
    
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    console.log("Bcrypt összehasonlítás eredménye:", match);
    if (!match) {
      return res.status(400).json({ message: 'Érvénytelen hitelesítő adatok' });
    }
    
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    console.error('Bejelentkezés hiba:', err);
    res.status(500).json({ message: 'Szerver hiba a bejelentkezés során', error: err.message });
  }
});

/* Itt jönnek a további API végpontok, például deckek, kártyák kezelése, tanulási mód és statisztikák. */

// Példa: STATISZTIKÁK lekérése
app.get('/api/statistics', authenticateToken, async (req, res) => {
  try {
    const decksResult = await pool.query('SELECT id FROM decks WHERE user_id = $1', [req.user.id]);
    const deckIds = decksResult.rows.map(row => row.id);
    if (deckIds.length === 0)
      return res.json({ successRate: 0, studyCount: 0 });
    
    const cardsResult = await pool.query(
      'SELECT correct_count, incorrect_count FROM cards WHERE deck_id = ANY($1)',
      [deckIds]
    );
    let totalCorrect = 0, totalAttempts = 0;
    cardsResult.rows.forEach(card => {
      totalCorrect += card.correct_count;
      totalAttempts += (card.correct_count + card.incorrect_count);
    });
    
    const successRate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
    res.json({ successRate, studyCount: totalAttempts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
