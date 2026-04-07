const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Schema
const userSchema = new mongoose.Schema({
  name: String,
  regNumber: { type: String, unique: true },
  totalPoints: { type: Number, default: 0 },
  membershipTier: { type: String, default: 'Silver' }
});
const User = mongoose.model('User', userSchema);

// Connection logic for Vercel
mongoose.connect(process.env.MONGO_URI);

// API 1: Register User (US.01)
app.post('/api/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).send(user);
  } catch (e) { res.status(400).send({error: "User already exists"}); }
});

// API 2: Add Points & Update Tier (US.05 & US.07)
app.post('/api/add-points', async (req, res) => {
  const { regNumber, amount } = req.body;
  const user = await User.findOne({ regNumber });
  if (user) {
    user.totalPoints += Math.floor(amount / 10); // 1 point per $10 spent
    if (user.totalPoints >= 500) user.membershipTier = 'Gold';
    await user.save();
    res.send(user);
  } else { res.status(404).send("User not found"); }
});

module.exports = app; // Required for Vercel
