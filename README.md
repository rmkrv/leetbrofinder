# LeetBroFinder

LeetBroFinder helps LeetCode users find compatible practice partners, chat, and start cooperative coding sessions.

**Live app:** [leetbrofinder.rmkrv.com](https://leetbrofinder.rmkrv.com)

## Features

- Public LeetCode profile verification
- Partner discovery by rating, language, activity, availability, and timezone
- Direct messages and connection requests
- Cooperative session matchmaking, problem suggestions, and optional voice chat
- Browser-based encryption for new direct and session messages

## Tech stack

- React, Vite, and TypeScript
- Spring Boot and Java 21
- PostgreSQL with Flyway migrations
- Vercel and Google Cloud Run

## Run locally

Requirements: Java 21, Node.js, npm, and Docker.

1. Review the example environment files and set the required variables.
2. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

3. Start the API:

   ```bash
   cd app
   ./mvnw spring-boot:run
   ```

   On Windows, use `mvnw.cmd spring-boot:run`.

4. In another terminal, start the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Open `http://localhost:5173`.

## Account verification and privacy

LeetBroFinder verifies account ownership by asking users to place a temporary token in the public **About** section of their LeetCode profile. It never requests a LeetCode password, cookie, or session token.

LeetBroFinder account passwords are stored as BCrypt hashes. New direct and cooperative-session messages are encrypted and signed in the browser before reaching the API. Private encryption keys remain in the browser and are not backed up, so clearing browser storage can make encrypted message history unavailable on that device.

## Copyright

Copyright (c) 2026 rmkrv. All rights reserved. This repository does not grant a license to use, modify, or redistribute the source code.
