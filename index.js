const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// --- SCHEMAS (UML Structural Model) ---
const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true, required: true },
  totalPoints: { type: Number, default: 0 },
  membershipTier: { type: String, default: 'Silver' },
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

// Connect via Vercel Environment Variable
mongoose.connect(process.env.MONGO_URI);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- CUSTOMER AUTH ---
app.post('/api/signup', async (req, res) => {
  try { res.status(201).send(await new User(req.body).save()); } 
  catch (e) { res.status(400).send({error: "Phone exists"}); }
});
app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ phone: req.body.phone });
  user ? res.send(user) : res.status(404).send({error: "Not found"});
});

// --- STAFF AUTH ---
app.post('/api/staff/signup', async (req, res) => {
  try { res.status(201).send(await new Staff(req.body).save()); } 
  catch (e) { res.status(400).send({error: "ID exists"}); }
});
app.post('/api/staff/login', async (req, res) => {
  const staff = await Staff.findOne({ staffID: req.body.staffID, password: req.body.password });
  staff ? res.send(staff) : res.status(401).send({error: "Denied"});
});

// --- LOYALTY ENGINE ---
app.post('/api/add-points', async (req, res) => {
  const { phone, amount } = req.body;
  const user = await User.findOne({ phone });
  if (user) {
    const pts = Math.floor(amount / 10);
    user.totalPoints += pts;
    user.history.unshift({ amount, points: pts, note: "Store Purchase" });
    if (user.totalPoints >= 500) user.membershipTier = 'Gold';
    await user.save(); res.send(user);
  } else res.status(404).send("User not found");
});

app.post('/api/redeem', async (req, res) => {
  const { phone, cost, item } = req.body;
  const user = await User.findOne({ phone });
  if (user && user.totalPoints >= cost) {
    user.totalPoints -= cost;
    user.history.unshift({ amount: 0, points: -cost, note: `Redeemed: ${item}` });
    await user.save(); res.send(user);
  } else res.status(400).send("Insufficient points");
});

// --- ADMIN ANALYTICS ---
app.get('/api/admin/stats', async (req, res) => {
  const users = await User.find();
  const totalUsers = users.length;
  const goldMembers = users.filter(u => u.membershipTier === 'Gold').length;
  const totalRevenue = users.reduce((acc, u) => acc + u.history.reduce((hAcc, h) => hAcc + (h.amount || 0), 0), 0);
  const totalPoints = users.reduce((acc, u) => acc + u.totalPoints, 0);
  res.send({ totalUsers, goldMembers, silverMembers: totalUsers - goldMembers, totalRevenue, totalPoints });
});

module.exports = app;
