const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// In-memory fallback store when MongoDB is offline
const memUsers = [];
function genId() { return String(Date.now()) + Math.floor(Math.random()*10000); }
async function memCreate({ username, email, password }){
  const hashed = await bcrypt.hash(password, 10);
  const user = { _id: genId(), username, email, password: hashed };
  memUsers.push(user);
  return user;
}
async function memFindByEmail(email){
  return memUsers.find(u => u.email === email) || null;
}
async function memFindById(id){
  return memUsers.find(u => u._id === String(id)) || null;
}
async function memUpdate(id, { username, email, password }){
  const u = await memFindById(id);
  if(!u) return null;
  u.username = username;
  u.email = email;
  if(password && password.trim() !== '') u.password = await bcrypt.hash(password, 10);
  return u;
}
async function memDelete(id){
  const idx = memUsers.findIndex(u => u._id === String(id));
  if(idx === -1) return false;
  memUsers.splice(idx,1);
  return true;
}

// Register
router.get('/register', (req, res) => {
  res.render('register');
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (mongoose.connection.readyState !== 1) {
      await memCreate({ username, email, password });
      return res.redirect('/login');
    }
    const user = new User({ username, email, password });
    await user.save();
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(400).render('register', { error: 'Registration failed' });
  }
});

// Login
router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    let user;
    if (mongoose.connection.readyState !== 1) {
      user = await memFindByEmail(email);
    } else {
      user = await User.findOne({ email });
    }
    if (!user) return res.status(401).render('login', { error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).render('login', { error: 'Invalid credentials' });
    res.redirect('/users');
  } catch (err) {
    console.error(err);
    res.status(500).render('login', { error: 'Server error' });
  }
});

// API login (returns JWT)
router.get('/api-login', (req, res) => {
  res.render('api-login');
});

router.post('/api-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    let user;
    if (mongoose.connection.readyState !== 1) {
      user = await memFindByEmail(email);
    } else {
      user = await User.findOne({ email });
    }
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const token = jwt.sign({ id: user._id, email: user.email }, secret, { expiresIn: '1h' });
    // return token and user (omit password)
    const safeUser = { _id: user._id, username: user.username, email: user.email };
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Users CRUD
router.get('/users', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      // DB not connected — render in-memory users
      return res.render('users', { users: memUsers, dbOffline: true });
    }
    const users = await User.find().lean();
    res.render('users', { users });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/users/new', (req, res) => {
  res.render('new');
});

router.post('/users', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (mongoose.connection.readyState !== 1) {
      await memCreate({ username, email, password });
      return res.redirect('/users');
    }
    const user = new User({ username, email, password });
    await user.save();
    res.redirect('/users');
  } catch (err) {
    console.error(err);
    res.status(400).render('new', { error: 'Create failed' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      const user = await memFindById(req.params.id);
      if (!user) return res.status(404).send('Not found');
      return res.render('show', { user });
    }
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).send('Not found');
    res.render('show', { user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/users/:id/edit', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      const user = await memFindById(req.params.id);
      if (!user) return res.status(404).send('Not found');
      return res.render('edit', { user });
    }
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).send('Not found');
    res.render('edit', { user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (mongoose.connection.readyState !== 1) {
      const u = await memUpdate(req.params.id, { username, email, password });
      if (!u) return res.status(404).send('Not found');
      return res.redirect(`/users/${u._id}`);
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send('Not found');
    user.username = username;
    user.email = email;
    if (password && password.trim() !== '') user.password = password;
    await user.save();
    res.redirect(`/users/${user._id}`);
  } catch (err) {
    console.error(err);
    res.status(400).send('Update failed');
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await memDelete(req.params.id);
      return res.redirect('/users');
    }
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/users');
  } catch (err) {
    console.error(err);
    res.status(500).send('Delete failed');
  }
});

module.exports = router;
