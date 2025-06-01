/* server.js */

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

// Supabase PostgreSQL kapcsolódás – connection string a .env-ből
// Az SSL opció hozzáadásával biztosítjuk, hogy a kapcsolat biztonságos legyen
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URI,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json());
app.use(cors());

// Statikus fájlok kiszolgálása (ha a frontend fájlok a gyökérben vannak)
app.use(express.static(path.join(__dirname)));

// Root route: az index.html kiszolgálása
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * JWT autentikációs middleware.
 * A kliensnek az Authorization header-ben kell elküldenie: "Bearer <token>" formában.
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
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      return res.status(400).json({ message: 'E-mail már regisztrálva van' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const insert = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );
    
    res.status(201).json({ message: 'Sikeres regisztráció', user: insert.rows[0] });
  } catch (err) {
    console.error('Regisztráció hiba:', err);
    res.status(500).json({ message: 'Szerver hiba a regisztráció során', error: err.message });
  }
});

/* BEJELENTKEZÉS: Felhasználó hitelesítése és JWT token generálása */
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Érvénytelen hitelesítő adatok' });
    }
    
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
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

/* Kártyacsomag műveletek */

// Deck lekérése a felhasználóhoz
app.get('/api/decks', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM decks WHERE user_id = $1', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Új deck létrehozása
app.post('/api/decks', authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO decks (name, description, user_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Deck módosítása
app.put('/api/decks/:deckId', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      'UPDATE decks SET name = $1, description = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, description, deckId, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Csomag nem található' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Deck törlése (és a kapcsolódó kártyák törlése)
app.delete('/api/decks/:deckId', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  try {
    await pool.query('DELETE FROM cards WHERE deck_id = $1', [deckId]);
    const result = await pool.query(
      'DELETE FROM decks WHERE id = $1 AND user_id = $2 RETURNING *',
      [deckId, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Csomag nem található' });
    res.json({ message: 'Csomag törölve' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

/* Kártya műveletek */

// Kártyák lekérése egy deckből
app.get('/api/decks/:deckId/cards', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  try {
    const deckResult = await pool.query(
      'SELECT * FROM decks WHERE id = $1 AND user_id = $2',
      [deckId, req.user.id]
    );
    if (deckResult.rows.length === 0)
      return res.status(404).json({ message: 'Csomag nem található' });
    
    const cards = await pool.query('SELECT * FROM cards WHERE deck_id = $1', [deckId]);
    res.json(cards.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Új kártya létrehozása egy deck-ben
app.post('/api/decks/:deckId/cards', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  const { question, answer } = req.body;
  try {
    const deckResult = await pool.query(
      'SELECT * FROM decks WHERE id = $1 AND user_id = $2',
      [deckId, req.user.id]
    );
    if (deckResult.rows.length === 0)
      return res.status(404).json({ message: 'Csomag nem található' });
    
    const result = await pool.query(
      'INSERT INTO cards (question, answer, deck_id, correct_count, incorrect_count) VALUES ($1, $2, $3, 0, 0) RETURNING *',
      [question, answer, deckId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Kártya módosítása
app.put('/api/decks/:deckId/cards/:cardId', authenticateToken, async (req, res) => {
  const { deckId, cardId } = req.params;
  const { question, answer } = req.body;
  try {
    const deckResult = await pool.query(
      'SELECT * FROM decks WHERE id = $1 AND user_id = $2',
      [deckId, req.user.id]
    );
    if (deckResult.rows.length === 0)
      return res.status(404).json({ message: 'Csomag nem található' });
    
    const result = await pool.query(
      'UPDATE cards SET question = $1, answer = $2 WHERE id = $3 AND deck_id = $4 RETURNING *',
      [question, answer, cardId, deckId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Kártya nem található' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Kártya törlése
app.delete('/api/decks/:deckId/cards/:cardId', authenticateToken, async (req, res) => {
  const { deckId, cardId } = req.params;
  try {
    const deckResult = await pool.query(
      'SELECT * FROM decks WHERE id = $1 AND user_id = $2',
      [deckId, req.user.id]
    );
    if (deckResult.rows.length === 0)
      return res.status(404).json({ message: 'Csomag nem található' });
    
    const result = await pool.query(
      'DELETE FROM cards WHERE id = $1 AND deck_id = $2 RETURNING *',
      [cardId, deckId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Kártya nem található' });
    res.json({ message: 'Kártya törölve' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

/* TANULÁSI MÓD: véletlenszerű kártya lekérése, majd a tanulási eredmény rögzítése */
app.get('/api/decks/:deckId/study', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  try {
    const deckResult = await pool.query(
      'SELECT * FROM decks WHERE id = $1 AND user_id = $2',
      [deckId, req.user.id]
    );
    if (deckResult.rows.length === 0)
      return res.status(404).json({ message: 'Csomag nem található' });
    
    const cardsResult = await pool.query('SELECT * FROM cards WHERE deck_id = $1', [deckId]);
    if (cardsResult.rows.length === 0)
      return res.status(404).json({ message: 'Nincsenek kártyák' });
    
    const randomIndex = Math.floor(Math.random() * cardsResult.rows.length);
    const card = cardsResult.rows[randomIndex];
    res.json(card);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

app.post('/api/decks/:deckId/study/:cardId', authenticateToken, async (req, res) => {
  const { deckId, cardId } = req.params;
  const { correct } = req.body;
  try {
    const deckResult = await pool.query(
      'SELECT * FROM decks WHERE id = $1 AND user_id = $2',
      [deckId, req.user.id]
    );
    if (deckResult.rows.length === 0)
      return res.status(404).json({ message: 'Csomag nem található' });
    
    if (correct) {
      await pool.query(
        'UPDATE cards SET correct_count = correct_count + 1 WHERE id = $1 AND deck_id = $2',
        [cardId, deckId]
      );
    } else {
      await pool.query(
        'UPDATE cards SET incorrect_count = incorrect_count + 1 WHERE id = $1 AND deck_id = $2',
        [cardId, deckId]
      );
    }
    res.json({ message: 'Eredmény rögzítve' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

/* STATISZTIKÁK lekérése */
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
