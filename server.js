// Dependencies
const express = require('express');
const app = express();
const path = require('path');
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

const PORT = parseInt(process.env.PORT, 10) || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Serve static assets from /public
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error', err));

// INDEX
app.get('/', (req, res) => {
  res.render('index.ejs');
});

// =====================
// NEW (Registration form) and LOGIN form
// - GET /register -> show registration form
// - GET /login -> show login form
// =====================
app.get('/register', (req, res) => res.render('register.ejs'));
app.get('/login', (req, res) => res.render('login.ejs'));

// Friendly API login page (GET) — shows usage and a simple form
app.get('/api/users/login', (req, res) => {
  try {
    return res.render('api-login.ejs');
  } catch (err) {
    console.error('Error rendering API login page', err);
    return res.status(500).send('Server error');
  }
});

// CREATE
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'email already in use' });
    const user = await User.create({ username, email, password });
    const out = user.toObject();
    delete out.password;
    return res.status(201).json(out);
  } catch (err) {
    console.error('Register error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Handle HTML form registration (redirect to user page)
app.post('/users/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.redirect('/register?error=missing');
    const existing = await User.findOne({ email });
    if (existing) return res.redirect('/register?error=exists');
    const user = await User.create({ username, email, password });
    return res.redirect(`/users/${user._id}`);
  } catch (err) {
    console.error('Register (form) error', err);
    return res.redirect('/register?error=server');
  }
});

// API: Login
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const generic = 'Incorrect email or password.';
    if (!email || !password) return res.status(400).json({ error: generic });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: generic });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: generic });
    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET || 'dev_jwt_secret', { expiresIn: '1h' });
    const out = user.toObject(); delete out.password;
    // If the client expects HTML (browser form submit), render a friendly page
    const wantsHtml = req.accepts('html') && !req.accepts('json');
    const isForm = (req.is && req.is('application/x-www-form-urlencoded')) || (req.get && (req.get('Content-Type') || '').includes('application/x-www-form-urlencoded'));
    if (wantsHtml || isForm) {
      return res.render('api-login-result.ejs', { token, user: out });
    }
    return res.json({ token, user: out });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Handle HTML form login (redirect to user page)
app.post('/users/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const generic = 'Incorrect email or password.';
    if (!email || !password) return res.redirect('/login?error=missing');
    const user = await User.findOne({ email });
    if (!user) return res.redirect('/login?error=bad');
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.redirect('/login?error=bad');
    // Successful form login — redirect to user's page
    return res.redirect(`/users/${user._id}`);
  } catch (err) {
    console.error('Login (form) error', err);
    return res.redirect('/login?error=server');
  }
});

// Simple auth middleware
function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET || 'dev_jwt_secret');
    req.userId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Protected route
app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'server error' });
  }
});

// API: list users (JSON) - excludes passwords
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (err) {
    console.error('Error listing users', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Web: list users page
app.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.render('users.ejs', { users });
  } catch (err) {
    console.error('Error rendering users page', err);
    res.status(500).send('Server error');
  }
});

// =====================
// SHOW - Display a single user
// - GET /users/:id -> render a page showing user details
// =====================
app.get('/users/:id', async (req, res) => {
  try {
    const id = normalizeId(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send('Invalid id');
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(404).send('User not found');
    res.render('show.ejs', { user });
  } catch (err) {
    console.error('Error showing user', err);
    res.status(500).send('Server error');
  }
});

// =====================
// EDIT - Render edit form for a user
// - GET /users/:id/edit -> render form to edit user
// =====================
app.get('/users/:id/edit', async (req, res) => {
  try {
    const id = normalizeId(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send('Invalid id');
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(404).send('User not found');
    res.render('edit.ejs', { user });
  } catch (err) {
    console.error('Error loading edit form', err);
    res.status(500).send('Server error');
  }
});

// =====================
// UPDATE - Process edit form
// - PUT /users/:id -> update user and redirect
// =====================
app.put('/users/:id', async (req, res) => {
  try {
    const id = normalizeId(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send('Invalid id');
    const body = req.body || {};
    Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });
    // Prevent password updates via this simple form (optional)
    // If a password is provided, load the user and save so pre-save hook hashes it
    if (body.password) {
      const user = await User.findById(id);
      if (!user) return res.status(404).send('User not found');
      // update allowed fields
      if (body.username) user.username = body.username;
      if (body.email) user.email = body.email;
      if (body.password && String(body.password).trim() !== '') user.password = body.password;
      await user.save();
      return res.redirect('/users');
    }

    await User.findByIdAndUpdate(id, body, { new: true, runValidators: true, context: 'query' });
    res.redirect('/users');
  } catch (err) {
    console.error('Error updating user', err);
    res.status(500).send('Server error');
  }
});

// =====================
// DELETE - Remove a user
// - DELETE /users/:id -> delete user and redirect
// =====================
app.delete('/users/:id', async (req, res) => {
  try {
    const id = normalizeId(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send('Invalid id');
    await User.findByIdAndDelete(id);
    res.redirect('/users');
  } catch (err) {
    console.error('Error deleting user', err);
    res.status(500).send('Server error');
  }
});

// Normalize and sanitize incoming id params (accepts optional "id:<hex>" form)
function normalizeId(param) {
  let id = String(param || '').trim();
  if (id.startsWith('id:')) id = id.slice(3);
  return id;
}

// =====================
// SHOW / EDIT / UPDATE / DELETE
// - GET  /users/:id       -> SHOW a single user (render a detail page)
// - GET  /users/:id/edit  -> EDIT form for a user
// - PUT  /users/:id       -> UPDATE user (process form)
// - DELETE /users/:id     -> DELETE user


// Start server
app.listen(PORT, () => console.log(`Server listening http://localhost:${PORT}`));
