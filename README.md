# LeetBroFinder

LeetBroFinder is a small, non-commercial app for finding LeetCode practice partners. Users verify ownership of a public LeetCode profile, add their practice preferences, browse compatible profiles, message each other, or open a cooperative coding session with another queued user.

## Live app

- Frontend: [leetbrofinder.rmkrv.com](https://leetbrofinder.rmkrv.com)
- API health: [Cloud Run `/api/health`](https://leetbrofinder-api-830799638465.europe-central2.run.app/api/health)

## Stack

- React + Vite + TypeScript
- Spring Boot REST API (Java 21)
- Neon PostgreSQL + Flyway migrations
- LeetCode's public GraphQL endpoint with a 15-minute Caffeine cache
- Vercel for the frontend and Google Cloud Run for the API

## Run locally

1. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

2. Start the API:

   ```bash
   cd app
   ./mvnw spring-boot:run
   ```

   On Windows, use `mvnw.cmd spring-boot:run`.

3. Start the web app:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Open `http://localhost:5173`.

## Verification

The app generates a short token such as `leetbro-verify-a1b2...`. The user adds it to their public LeetCode **About** section, then asks the app to check it. LeetBroFinder never requests a LeetCode password, cookie, or session token. After verification, the user finishes setup and creates a separate LeetBroFinder password. Passwords are stored as BCrypt hashes, never as plaintext.

Users log in with their LeetCode username and LeetBroFinder password. A normal login lasts 12 hours in the current browser session. Selecting **Stay signed in for 30 days** stores an opaque session token on that device for 30 days.

## Configuration

Copy `.env.example` values into your environment as needed. The frontend proxies `/api` to `http://localhost:8080` during development. Production builds set `VITE_API_URL` to the deployed API origin.

The Spring Boot API reads `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`. For Neon, use a direct JDBC URL (`jdbc:postgresql://...`) so the same connection can safely run Flyway migrations at startup. No database credentials are stored in application configuration or source control.

For local Docker Compose, set `POSTGRES_PASSWORD` for the container and export the `DB_*` values shown in `.env.example` before starting Spring Boot.

## Production deployment

The frontend is deployed from the `frontend` directory on Vercel with:

```text
VITE_API_URL=https://leetbrofinder-api-830799638465.europe-central2.run.app
```

The API runs as the public Cloud Run service `leetbrofinder-api` in `europe-central2`. It scales from zero to a maximum of one instance with 1 CPU and 512 MiB of memory. Database credentials are supplied through Google Secret Manager and are never stored in the repository.

## API highlights

- `POST /api/verification/start`
- `POST /api/verification/{id}/confirm`
- `POST /api/auth/login` and `POST /api/auth/logout`
- `GET /api/profiles` with rating, language, activity, availability, and timezone filters
- `PATCH /api/profiles/me`
- `POST /api/live-search` and `GET /api/live-search/{id}`
- `POST /api/coop-sessions/queue` and `GET /api/coop-sessions/{id}`
- `POST /api/coop-sessions/{id}/accept`, `/reroll`, `/suggest`, and `/leave`
- `GET/POST /api/coop-sessions/{id}/messages` and the `/voice/*` signaling endpoints
- `PUT /api/e2ee/keys/me` and `GET /api/e2ee/keys/{profileId}`
- `GET/POST /api/connections` and `POST /api/connections/{id}/accept`
- `GET/POST /api/conversations`

## Cooperative coding sessions

The API owns the matchmaking queue and pairs users by the closest available contest rating. It reads the current LeetCode catalog size and selects a problem at a uniformly random catalog index. Either partner can suggest a LeetCode URL/title, and a reroll needs the other partner's agreement. The session becomes active only when both users accept the current problem. There is no timer, score, winner, or submission verification.

Session discussion is stored with the session. Optional voice uses browser WebRTC audio and short-lived, in-memory signaling state on the API; it is not a persistent voice room. Partners can exchange connection requests after a session starts, and contact details remain hidden until the recipient accepts.

## End-to-end encrypted messages

New direct messages and cooperative-session messages are encrypted and signed in the browser before they reach the API. Each browser creates a non-exportable P-256 ECDH encryption key and ECDSA signing key in IndexedDB. Message text is protected with AES-256-GCM using a key derived from the two participants' device keys. The API stores ciphertext, authenticated encryption parameters, signatures, and public-key fingerprints; it never receives plaintext for new messages.

Public keys are immutable after first registration, and the browser pins a partner's first-seen fingerprint. The UI exposes the full fingerprint as a safety code. Existing rows from before migration V7 remain readable as visibly labeled legacy unencrypted messages; they are not silently deleted or rewritten.

The current v1 design is intentionally single-browser. Clearing browser storage or moving to a new browser loses access to that account's encrypted history, and there is no key recovery or multi-device synchronization yet. It also does not implement a Signal-style forward-secrecy ratchet; those capabilities require a separate device and key-backup design.

Authenticated profile actions use an opaque session token in the internal `X-Profile-Key` header. The token is managed by the frontend and is never presented as a user credential. API responses are rate-limited per client IP.
