# Express + Mongoose Auth + Simple API — Quick Reference

This README documents a minimal, repeatable flow for building an Express API with user registration, login (bcrypt + JWT), and protected routes. Keep this as a template for future projects.

## Prerequisites
- Node.js (14+)
- MongoDB (local or hosted)
- Basic familiarity with Express and Mongoose

## Environment variables (.env)
- `MONGO_URI` — MongoDB connection string
- `PORT` — optional web port (fallback used if missing)
- `JWT_SECRET` — secret used to sign tokens (use a strong secret in production)

Example .env:

MONGO_URI=mongodb://localhost:27017/myapp
PORT=3000
JWT_SECRET=replace_with_secure_secret

## Install dependencies

```bash
npm install express mongoose dotenv bcrypt jsonwebtoken ejs method-override
npm install --save-dev nodemon
```

## Project layout (minimal)

- server.js            <-- main Express app, routes, middleware
- models/User.js      <-- Mongoose schema, pre-save bcrypt hook
- views/              <-- optional EJS templates (login, register, index)
- scripts/hash_users.js <-- one-off to migrate plaintext passwords
- package.json
- .env

## User model (summary)
- Fields: `username`, `email` (unique), `password` (min length)
- Pre-save hook: when `isModified('password')`, hash it with `bcrypt.hash(password, saltRounds)`
- Optionally implement an instance method `isCorrectPassword(plain)` that runs `bcrypt.compare`

## Routes (essential)

1) POST /api/users/register
- Validate `username`, `email`, `password` present
- Check uniqueness of `email` (or `username`)
- Create user: `User.create({ username, email, password })` (pre-save will hash)
- Respond: `201` with created user object (remove `password` before sending)

2) POST /api/users/login
- Accept `email` and `password` in `req.body`
- Find user by email: `User.findOne({ email })`
- If not found: respond `400` with generic message: `"Incorrect email or password."`
- Compare password: `bcrypt.compare(incoming, user.password)`
  - If your DB may contain plaintext passwords, detect bcrypt-format (e.g. `/^\$2[aby]\$/`) and:
    - If stored value is plaintext and matches incoming password, `bcrypt.hash` it and save the user (migration-on-login)
- If match: sign a JWT: `jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' })`
- Respond `200` with `{ token, user }` (user object should not include `password`)

3) GET /api/me (protected)
- Middleware `auth` checks `Authorization: Bearer <token>` header
- `jwt.verify(token, JWT_SECRET)` -> payload with `id`
- Load user by id `User.findById(id).select('-password')` and attach to `req.user`
- Return `req.user` as JSON

## Web views (optional)
- Provide small EJS pages for `GET /users/login` and `GET /users/new` that POST to the API endpoints.
- For GET requests to `/api/users/login` you can redirect to `/users/login` so human visitors see a form.

## Password migration / one-off script
- If you imported legacy users with plaintext passwords, add a `scripts/hash_users.js` that:
  - Connects to `MONGO_URI`
  - Iterates users and checks if `user.password` matches bcrypt regex (`/^\$2[aby]\$/i`). If not, `bcrypt.hash` and save.
- Run it manually (stop `nodemon` first) to avoid file-change restarts interfering with the run:

```bash
# stop nodemon (Ctrl+C) then:
node scripts/hash_users.js
```

## Quick run / dev commands

```bash
# start dev (nodemon)
npx nodemon server.js

# or run directly
node server.js
```

<!-- Deployment instructions removed per user request -->

## Testing (curl examples)

Register:
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"secret123"}'
```

Login:
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}'
```

Get current user:
```bash
curl http://localhost:3000/api/me -H "Authorization: Bearer <TOKEN>"
```

## Security notes
- Always use HTTPS in production.
- Use a strong `JWT_SECRET` and rotate secrets periodically if possible.
- Keep token expiry short for sensitive apps and provide refresh tokens if needed.
- Sanitize/validate incoming data and avoid returning full DB objects directly.
- Store only necessary user fields in the JWT (no passwords, no PII beyond what you intend to share).

## Troubleshooting
- If `req.body` is empty, ensure `app.use(express.json())` and `app.use(express.urlencoded({ extended: true }))` are enabled.
- If `process.env.PORT` is undefined, ensure `require('dotenv').config()` is called early (top of `server.js`) and use a fallback: `const port = parseInt(process.env.PORT, 10) || 3000`.
- For invalid Mongo ObjectId errors, validate/sanitize `req.params.id` before calling Mongoose functions.

## Next steps / enhancements
- Add input validation with `express-validator` or a schema library.
- Add request logging and tests.
- Implement refresh tokens + token revocation if needed.

---

Keep a copy of this file as your base template; you can strip or expand sections depending on project needs.

## Simplified Usage (beginner-friendly)

If you want a minimal starting point that still provides register/login + JWT:

1. Start the app:

```bash
npm install
npx nodemon server.js
```

2. Web forms:
- `GET /register` — simple registration form
- `GET /login` — simple login form

3. API endpoints:
- `POST /api/users/register` — JSON or form body: `username,email,password` → returns `201` and user (no password)
- `POST /api/users/login` — JSON or form body: `email,password` → returns `{ token, user }`
- `GET /api/me` — protected; include header `Authorization: Bearer <token>`

4. Environment: add `MONGO_URI` and `JWT_SECRET` to `.env` and restart the server.

This repo already contains a simplified server implementation in `server.js` and a minimal `models/User.js` for easy reuse.
