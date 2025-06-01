/* server.js */

// Függőségek betöltése
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const cors = require('cors');

// Express alkalmazás létrehozása
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Middleware-ek
app.use(express.json());
app.use(cors());

// MongoDB kapcsolódás (állítsd be a MONGODB_URI környezeti változót, ha szükséges)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/flashcards', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB kapcsolódva'))
  .catch(err => console.error(err));

// Mongoose sémák és modellek

// Felhasználó séma
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Kártyacsomag séma
const deckSchema = new mongoose.Schema({
  name: String,
  description: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
const Deck = mongoose.model('Deck', deckSchema);

// Kártya séma
const cardSchema = new mongoose.Schema({
  question: String,
  answer: String,
  deck: { type: mongoose.Schema.Types.ObjectId, ref: 'Deck' },
  correctCount: { type: Number, default: 0 },
  incorrectCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const Card = mongoose.model('Card', cardSchema);

// JWT autentikáció middleware-je
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.status(401).json({ message: 'Token hiányzik' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Érvénytelen token' });
    req.user = user;
    next();
  });
}

// API végpontok

// Regisztráció
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Ellenőrizzük, hogy létezik-e már a felhasználó
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'E-mail már regisztrálva van' });
    
    // Jelszó bcrypt-tel hash-elése
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'Sikeres regisztráció' });
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Bejelentkezés
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Érvénytelen hitelesítő adatok' });
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Érvénytelen hitelesítő adatok' });
    
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Felhasználó összes kártyacsomagjának lekérése
app.get('/api/decks', authenticateToken, async (req, res) => {
  try {
    const decks = await Deck.find({ user: req.user.id });
    res.json(decks);
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Új kártyacsomag létrehozása
app.post('/api/decks', authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  try {
    const deck = new Deck({ name, description, user: req.user.id });
    await deck.save();
    res.status(201).json(deck);
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Kártyacsomag módosítása
app.put('/api/decks/:deckId', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  const { name, description } = req.body;
  try {
    const deck = await Deck.findOneAndUpdate({ _id: deckId, user: req.user.id }, { name, description }, { new: true });
    if (!deck) return res.status(404).json({ message: 'Csomag nem található' });
    res.json(deck);
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Kártyacsomag törlése (és a hozzá tartozó kártyák törlése)
app.delete('/api/decks/:deckId', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  try {
    await Deck.findOneAndDelete({ _id: deckId, user: req.user.id });
    await Card.deleteMany({ deck: deckId });
    res.json({ message: 'Csomag törölve' });
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Kártyák lekérése egy csomagból
app.get('/api/decks/:deckId/cards', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  try {
    const deck = await Deck.findOne({ _id: deckId, user: req.user.id });
    if (!deck) return res.status(404).json({ message: 'Csomag nem található' });
    
    const cards = await Card.find({ deck: deckId });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Új kártya létrehozása egy csomagban
app.post('/api/decks/:deckId/cards', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  const { question, answer } = req.body;
  try {
    const deck = await Deck.findOne({ _id: deckId, user: req.user.id });
    if (!deck) return res.status(404).json({ message: 'Csomag nem található' });
    
    const card = new Card({ question, answer, deck: deckId });
    await card.save();
    res.status(201).json(card);
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Kártya módosítása
app.put('/api/decks/:deckId/cards/:cardId', authenticateToken, async (req, res) => {
  const { deckId, cardId } = req.params;
  const { question, answer } = req.body;
  try {
    const deck = await Deck.findOne({ _id: deckId, user: req.user.id });
    if (!deck) return res.status(404).json({ message: 'Csomag nem található' });
    
    const card = await Card.findOneAndUpdate({ _id: cardId, deck: deckId }, { question, answer }, { new: true });
    if (!card) return res.status(404).json({ message: 'Kártya nem található' });
    
    res.json(card);
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Kártya törlése
app.delete('/api/decks/:deckId/cards/:cardId', authenticateToken, async (req, res) => {
  const { deckId, cardId } = req.params;
  try {
    const deck = await Deck.findOne({ _id: deckId, user: req.user.id });
    if (!deck) return res.status(404).json({ message: 'Csomag nem található' });
    
    await Card.findOneAndDelete({ _id: cardId, deck: deckId });
    res.json({ message: 'Kártya törölve' });
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Tanulási mód: véletlenszerű kártya lekérése egy csomagból
app.get('/api/decks/:deckId/study', authenticateToken, async (req, res) => {
  const { deckId } = req.params;
  try {
    const deck = await Deck.findOne({ _id: deckId, user: req.user.id });
    if (!deck) return res.status(404).json({ message: 'Csomag nem található' });
    
    const cards = await Card.find({ deck: deckId });
    if (!cards.length) return res.status(404).json({ message: 'Nincsenek kártyák' });
    
    const card = cards[Math.floor(Math.random() * cards.length)];
    res.json(card);
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Tanulási eredmény rögzítése egy kártyához
app.post('/api/decks/:deckId/study/:cardId', authenticateToken, async (req, res) => {
  const { deckId, cardId } = req.params;
  const { correct } = req.body;
  try {
    const deck = await Deck.findOne({ _id: deckId, user: req.user.id });
    if (!deck) return res.status(404).json({ message: 'Csomag nem található' });
    
    const card = await Card.findOne({ _id: cardId, deck: deckId });
    if (!card) return res.status(404).json({ message: 'Kártya nem található' });
    
    if (correct) {
      card.correctCount += 1;
    } else {
      card.incorrectCount += 1;
    }
    await card.save();
    res.json({ message: 'Eredmény rögzítve' });
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Felhasználói statisztikák lekérése
app.get('/api/statistics', authenticateToken, async (req, res) => {
  try {
    const decks = await Deck.find({ user: req.user.id });
    const deckIds = decks.map(deck => deck._id);
    
    const cards = await Card.find({ deck: { $in: deckIds } });
    
    let totalCorrect = 0;
    let totalAttempts = 0;
    cards.forEach(card => {
      totalCorrect += card.correctCount;
      totalAttempts += (card.correctCount + card.incorrectCount);
    });
    
    const successRate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
    const studyCount = totalAttempts;
    
    res.json({ successRate, studyCount });
  } catch (err) {
    res.status(500).json({ message: 'Szerver hiba' });
  }
});

// Szerver indítása
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
