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
// name is NOT required at schema level so our manual validation runs first
const userSchema = new mongoose.Schema({
  name: { type: String },
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

// --- DB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");
    try {
      await User.syncIndexes();
      await Staff.syncIndexes();
      console.log("Indexes synced");
    } catch (e) {
      console.error("Index sync error:", e.message);
    }
  })
  .catch(err => console.error("DB Error:", err));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- CUSTOMER AUTH ---
app.post('/api/signup', async (req, res) => {
  try {
    console.log("Signup request body:", JSON.stringify(req.body));

    const phone = req.body.phone ? String(req.body.phone).trim() : '';
    const name  = req.body.name  ? String(req.body.name).trim()  : '';

    if (!phone) {
      console.log("Signup rejected: no phone");
      return res.status(400).json({ error: "Phone number is required" });
    }
    if (!name) {
      console.log("Signup rejected: no name");
      return res.status(400).json({ error: "Name is required" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      console.log("Signup rejected: phone already exists", phone);
      return res.status(400).json({ error: "Phone already registered. Please sign in instead." });
    }

    const user = new User({ phone, name, totalPoints: 0, membershipTier: 'Bronze', history: [] });
    await user.save();
    console.log("User created:", phone);
    return res.status(201).json(user);

  } catch (e) {
    console.error("Signup error:", e.message, "code:", e.code);
    if (e.code === 11000) {
      return res.status(400).json({ error: "Phone already registered. Please sign in instead." });
    }
    return res.status(500).json({ error: "Server error: " + e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    console.log("Login request body:", JSON.stringify(req.body));
    const phone = req.body.phone ? String(req.body.phone).trim() : '';
    if (!phone) return res.status(400).json({ error: "Phone number is required" });
    const user = await User.findOne({ phone });
    console.log("Login lookup for", phone, "found:", !!user);
    return user ? res.json(user) : res.status(404).json({ error: "Member not found" });
  } catch (e) {
    console.error("Login error:", e.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- STAFF AUTH ---
app.post('/api/staff/signup', async (req, res) => {
  try {
    const { staffID, password, name } = req.body;
    if (!staffID || !password) {
      return res.status(400).json({ error: "Staff ID and password are required" });
    }
    const existing = await Staff.findOne({ staffID });
    if (existing) {
      return res.status(400).json({ error: "Staff ID already exists" });
    }
    const staff = await new Staff({ staffID, password, name }).save();
    return res.status(201).json(staff);
  } catch (e) {
    console.error("Staff signup error:", e.message);
    if (e.code === 11000) {
      return res.status(400).json({ error: "Staff ID already exists" });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

app.post('/api/staff/login', async (req, res) => {
  try {
    const staff = await Staff.findOne({ staffID: req.body.staffID, password: req.body.password });
    return staff ? res.json(staff) : res.status(401).json({ error: "Invalid credentials" });
  } catch (e) {
    console.error("Staff login error:", e.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- LOYALTY ENGINE ---
app.post('/api/add-points', async (req, res) => {
  try {
    const phone  = req.body.phone  ? String(req.body.phone).trim() : '';
    const amount = req.body.amount ? Number(req.body.amount)       : 0;
    if (!phone || !amount) return res.status(400).json({ error: "Phone and amount are required" });
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: "User not found" });
    const pts     = Math.floor(amount / 10);
    const oldTier = user.membershipTier;
    user.totalPoints    += pts;
    user.membershipTier  = assignTier(user.totalPoints);
    user.history.unshift({ amount, points: pts, note: "Store Purchase" });
    await user.save();
    const result = user.toObject();
    result.previousTier = oldTier;
    return res.json(result);
  } catch (e) {
    console.error("Add points error:", e.message);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post('/api/redeem', async (req, res) => {
  try {
    const phone = req.body.phone ? String(req.body.phone).trim() : '';
    const cost  = Number(req.body.cost);
    const item  = req.body.item  ? String(req.body.item)  : '';
    if (!phone || !cost || !item) return res.status(400).json({ error: "Phone, cost and item are required" });
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.totalPoints < cost) return res.status(400).json({ error: "Insufficient points" });
    user.totalPoints    -= cost;
    user.membershipTier  = assignTier(user.totalPoints);
    user.history.unshift({ amount: 0, points: -cost, note: `Redeemed: ${item}` });
    await user.save();
    return res.json(user);
  } catch (e) {
    console.error("Redeem error:", e.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- ADMIN ANALYTICS ---
app.get('/api/admin/stats', async (req, res) => {
  try {
    const users           = await User.find();
    const totalUsers      = users.length;
    const bronzeMembers   = users.filter(u => u.membershipTier === 'Bronze').length;
    const silverMembers   = users.filter(u => u.membershipTier === 'Silver').length;
    const goldMembers     = users.filter(u => u.membershipTier === 'Gold').length;
    const platinumMembers = users.filter(u => u.membershipTier === 'Platinum').length;
    const diamondMembers  = users.filter(u => u.membershipTier === 'Diamond').length;

    const totalRevenue = users.reduce((acc, u) =>
      acc + u.history.reduce((hAcc, h) => hAcc + (h.amount || 0), 0), 0);
    const totalPoints = users.reduce((acc, u) => acc + u.totalPoints, 0);
    const totalRedeemed = users.reduce((acc, u) =>
      acc + u.history.reduce((hAcc, h) => hAcc + (h.points < 0 ? Math.abs(h.points) : 0), 0), 0);

    const topMembers = [...users]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 5)
      .map(u => ({ name: u.name, phone: u.phone, totalPoints: u.totalPoints, membershipTier: u.membershipTier }));

    return res.json({
      totalUsers, bronzeMembers, silverMembers, goldMembers, platinumMembers, diamondMembers,
      totalRevenue, totalPoints, totalRedeemed, topMembers
    });
  } catch (e) {
    console.error("Analytics error:", e.message);
    return res.status(500).json({ error: "Analytics error" });
  }
});

if (require.main === module) {
  app.listen(3000, () => console.log('Running on port 3000'));
}
module.exports = app;
