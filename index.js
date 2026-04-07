const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// User Schema (UML Structural Modeling)
const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true, required: true },
  totalPoints: { type: Number, default: 0 },
  membershipTier: { type: String, default: 'Silver' },
  history: [{
    amount: Number,
    points: Number,
    date: { type: Date, default: Date.now }
  }]
});
const User = mongoose.model('User', userSchema);

// Connect using Vercel Environment Variable
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("DB Connected"))
  .catch(err => console.error("DB Error:", err));

// Serve Frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// US.01: Signup
app.post('/api/signup', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).send(user);
  } catch (e) { res.status(400).send({error: "Phone already exists"}); }
});

// US.01: Login
app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ phone: req.body.phone });
  if (user) res.send(user);
  else res.status(404).send({error: "User not found"});
});

// US.05 & US.07: Add Points & Update Tier
app.post('/api/add-points', async (req, res) => {
  const { phone, amount } = req.body;
  const user = await User.findOne({ phone });
  if (user) {
    const pointsEarned = Math.floor(amount / 10);
    user.totalPoints += pointsEarned;
    user.history.unshift({ amount, points: pointsEarned });
    
    if (user.totalPoints >= 500) user.membershipTier = 'Gold';
    
    await user.save();
    res.send(user);
  } else { res.status(404).send("User not found"); }
});

module.exports = app;
