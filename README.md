# Doc365

Trusted health records for Sri Lanka (learning prototype).
A health card for everyone; a doctor scans the card and sees the patient's
verified history from every hospital and lab. Fake data only.

- Design decisions: `docs/DESIGN.md`
- Build plan (for Claude Code): `CLAUDE.md`

## Setup
1. Install Node.js 20 or newer, Git, VS Code, and Docker Desktop
   (or PostgreSQL 16 installed locally instead of Docker).
2. Copy `.env.example` to `.env`.
3. Start the database: `docker compose up -d`
4. Try the trust core:
   ```
   cd server
   npm run keys
   npm run demo:signing
   ```
