const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// --- TIER HELPER ---
function assignTier(points) {
  if (points >= 5000) return 'Diamond';
  if (points >= 2000) return 'Platinum';
  if (points >= 500)  return 'Gold';
  if (points >= 150)  return 'Silver';
  return 'Bronze';
}

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true, required: true },
  totalPoints: { type: Number, default: 0 },
  membershipTier: { type: String, default: 'Bronze' },
  history: [{
    amount: Number,
    points: Number,
    note: String,
    date: { type: Date, default: Date.now }
  }]
});
const User = mongoose.model('User', userSchema);

const staffSchema = new mongoose.Schema({
  name: String,
  staffID: { type: String, unique: true, required: true },
  password: { type: String, required: true }
});
const Staff = mongoose.model('Staff', staffSchema);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("DB Error:", err));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- CUSTOMER AUTH ---
app.post('/api/signup', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).send({ error: "Name is required" });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).send({ error: "Phone number is required" });
    }
    const user = await new User({ phone: phone.trim(), name: name.trim() }).save();
    res.status(201).send(user);
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).send({ error: "Phone already registered. Please sign in instead." });
    }
    res.status(500).send({ error: "Server error" });
  }
});

app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ phone: req.body.phone });
  user ? res.send(user) : res.status(404).send({ error: "Member not found" });
});

// --- STAFF AUTH ---
app.post('/api/staff/signup', async (req, res) => {
  try {
    const { staffID, password, name } = req.body;
    if (!staffID || !password) {
      return res.status(400).send({ error: "Staff ID and password are required" });
    }
    const staff = await new Staff({ staffID, password, name }).save();
    res.status(201).send(staff);
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).send({ error: "Staff ID already exists" });
    }
    res.status(500).send({ error: "Server error" });
  }
});

app.post('/api/staff/login', async (req, res) => {
  const staff = await Staff.findOne({ staffID: req.body.staffID, password: req.body.password });
  staff ? res.send(staff) : res.status(401).send({ error: "Invalid credentials" });
});

// --- LOYALTY ENGINE ---
app.post('/api/add-points', async (req, res) => {
  const { phone, amount } = req.body;
  try {
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).send({ error: "User not found" });
    const pts = Math.floor(amount / 10);
    user.totalPoints += pts;
    user.history.unshift({ amount, points: pts, note: "Store Purchase" });
    user.membershipTier = assignTier(user.totalPoints);
    await user.save();
    res.send(user);
  } catch (e) {
    res.status(500).send({ error: "Server error" });
  }
});

app.post('/api/redeem', async (req, res) => {
  const { phone, cost, item } = req.body;
  try {
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).send({ error: "User not found" });
    if (user.totalPoints < cost) return res.status(400).send({ error: "Insufficient points" });
    user.totalPoints -= cost;
    user.history.unshift({ amount: 0, points: -cost, note: `Redeemed: ${item}` });
    user.membershipTier = assignTier(user.totalPoints);
    await user.save();
    res.send(user);
  } catch (e) {
    res.status(500).send({ error: "Server error" });
  }
});

// --- ADMIN ANALYTICS ---
app.get('/api/admin/stats', async (req, res) => {
  try {
    const users = await User.find();
    const totalUsers = users.length;
    const goldMembers = users.filter(u => u.membershipTier === 'Gold').length;
    const diamondMembers = users.filter(u => u.membershipTier === 'Diamond').length;
    const platinumMembers = users.filter(u => u.membershipTier === 'Platinum').length;
    const silverMembers = users.filter(u => u.membershipTier === 'Silver').length;
    const bronzeMembers = users.filter(u => u.membershipTier === 'Bronze').length;

    const totalRevenue = users.reduce((acc, u) =>
      acc + u.history.reduce((hAcc, h) => hAcc + (h.amount || 0), 0), 0);

    const totalPoints = users.reduce((acc, u) => acc + u.totalPoints, 0);

    const totalRedeemed = users.reduce((acc, u) =>
      acc + u.history.reduce((hAcc, h) => hAcc + (h.points < 0 ? Math.abs(h.points) : 0), 0), 0);

    const topMembers = [...users]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 5)
      .map(u => ({ name: u.name, phone: u.phone, totalPoints: u.totalPoints, membershipTier: u.membershipTier }));

    res.send({
      totalUsers,
      goldMembers,
      diamondMembers,
      platinumMembers,
      silverMembers,
      bronzeMembers,
      silverMembers: totalUsers - goldMembers,
      totalRevenue,
      totalPoints,
      totalRedeemed,
      topMembers
    });
  } catch (e) {
    res.status(500).send({ error: "Analytics error" });
  }
});

if (require.main === module) {
  app.listen(3000, () => console.log('Running on port 3000'));
}
module.exports = app;
