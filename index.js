const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 📱 Schema updated: Removed regNumber, added Phone as unique ID
const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true, required: true },
  totalPoints: { type: Number, default: 0 },
  membershipTier: { type: String, default: 'Silver' },
  transactions: [{
    amount: Number,
    pointsEarned: Number,
    date: { type: Date, default: Date.now }
  }]
});
const User = mongoose.model('User', userSchema);

mongoose.connect(process.env.MONGO_URI);

// 🏠 Serve the Frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// 📝 SIGNUP API
app.post('/api/signup', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).send(user);
  } catch (e) { res.status(400).send({error: "Phone number already registered"}); }
});

// 🔑 LOGIN API
app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ phone: req.body.phone });
  if (user) res.send(user);
  else res.status(404).send({error: "User not found"});
});

// 💳 STAFF: ADD TRANSACTION (US.05)
app.post('/api/add-transaction', async (req, res) => {
  const { phone, amount } = req.body;
  const user = await User.findOne({ phone });
  if (user) {
    const points = Math.floor(amount / 10);
    user.totalPoints += points;
    user.transactions.push({ amount, pointsEarned: points });
    
    // Tier Logic (US.07)
    if (user.totalPoints >= 500) user.membershipTier = 'Gold';
    
    await user.save();
    res.send(user);
  } else { res.status(404).send("User not found"); }
});

module.exports = app;
