## Copilot / AI contributor guide — Family First backend

Target: Help an automated coding agent become productive quickly in this repo (Node + Express + Mongoose).

1) Big-picture architecture
- Small monolithic Express API (entry: `src/server.js` -> `src/app.js`).
- Routes are defined under `src/routes/*` and controller logic under `src/controllers/*`.
- Data layer: Mongoose models live in `src/models/*` (notably `User.js`, `Key.js`, `Child.js`).
- Auth: JWT access tokens + cookie refresh tokens. Refresh tokens are hashed and stored in `User.refreshTokens`.
- Server exports `app` for serverless usage (see end of `src/server.js`).

2) Important files to inspect (quick hits)
- `src/app.js` — middleware, CORS, mounted routes. Use it to see available endpoints.
- `src/server.js` — connects to Mongo, sets `process.env.DB_SUPPORTS_TRANSACTIONS` and `app.locals.dbSupportsTransactions`, starts server.
- `src/middleware/auth.js` — `authenticateToken` and `authorizeRole` helpers. Use these for protected endpoints.
- `src/controllers/authController.js` — login / refresh / logout flow. Shows how refresh token rotation and hashing are implemented.
- `src/models/User.js` — role enum (`['admin','nd','ss','db','retailer','parent']`) and important indexes.
- `src/models/Key.js` and `src/models/Child.js` — assignment and ownership patterns (indexes are meaningful for queries).

3) Environment & run tasks
- Required env keys seen in repo: `MONGO_URI`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `PORT`, `NODE_ENV`, optionally `ALLOWED_ORIGINS`.
- Local dev bootstrap:
  - `npm install`
  - `npm start` (uses `nodemon src/server.js` per `package.json`)
- One-off scripts: `npm run backfill:city` executes `scripts/backfill_city.js`.

4) Project-specific conventions and patterns
- Token handling:
  - Access token: short-lived JWT signed with `ACCESS_TOKEN_SECRET` (sent in `Authorization: Bearer ...`).
  - Refresh token: long-lived JWT in cookie `refreshToken`. The raw token is hashed (bcrypt) and pushed into `User.refreshTokens`.
  - Token rotation: when refresh is used, the old hashed token is removed and a new hashed token is stored.
  - Implementation detail: the code currently finds a user owning a refresh token by iterating `User.find({})` and comparing each hashed token — this is intentional and must be preserved unless migrating storage.

- DB transactions detection: `src/server.js` detects replica-set/transaction support and exposes `app.locals.dbSupportsTransactions`. Use that flag before attempting multi-document transactions.

- Role-based routing: many endpoints expect `req.user.role` to match route expectations. Use `authorizeRole([...])` in `src/middleware/auth.js`.

- Indexes: models declare several indexes (e.g., `keySchema.index({ validUntil: 1 })`, `userSchema.index({ role: 1, status: 1 })`). Prefer queries that leverage these fields for performance.

- Logging: controllers include extensive `console.log` traces. When editing, preserve or adapt the pattern rather than removing all logs.

5) How to add a new API endpoint (exact steps)
 - Create controller function in `src/controllers/<thing>Controller.js`.
 - Add a route file `src/routes/<thing>.js` that imports the controller and exports an Express Router.
 - Mount the route in `src/app.js` (e.g., `app.use('/thing', thingRoutes);`).
 - If the endpoint requires auth, wrap handlers with `authenticateToken` and optionally `authorizeRole([...])`.
 - If it mutates multiple collections and `app.locals.dbSupportsTransactions === true`, prefer using an explicit Mongoose session/transaction.

6) Examples (copyable mental snippets)
- Protected route pattern (use middleware):
  - See `src/middleware/auth.js`. Example usage:

    // in a route: router.get('/secret', authenticateToken, authorizeRole(['admin']), handler)

- Reading and rotating refresh tokens (see `src/controllers/authController.js`) — preserve hashed-storage logic and cookie naming (`refreshToken`).

7) Integration points & external dependencies
- MongoDB via Mongoose — connection in `src/server.js`.
- JWT via `jsonwebtoken` (ACCESS/REFRESH secrets in env).
- Bcrypt for password and refresh token hashing.
- cookie-parser and body-parser used for HTTP parsing.

8) Things an AI agent must NOT change lightly
- The refresh-token storage & rotation scheme: switching to plaintext or removing the DB-side hashing will break security assumptions across users. If proposing a change, provide a migration plan.
- Role enum values in `src/models/User.js` — many parts of the app rely on them.
- Route mounts in `src/app.js` — keep ordering (health endpoints mounted at `/`).

9) Quick troubleshoot / debugging tips
- If CORS is blocking front-end requests, check `ALLOWED_ORIGINS` handling in `src/app.js`. Default currently uses `'*'` for development.
- Use the many `console.log` statements in controllers to trace request-level data (login flow, token rotation). New logs should follow same verbosity and structure.
- For local DB testing, ensure your `MONGO_URI` points to a replica set if you need `dbSupportsTransactions` true.

10) Suggested next-steps for the maintainer (for review only)
- Consider replacing the full-scan refresh-token lookup with a searchable structure (e.g., map of tokenId -> user) — but only after planning migration.

If any area above is unclear or you want more examples (route template, test harness, or a suggested refactor plan for refresh-token lookup), tell me which part to expand and I will iterate.
