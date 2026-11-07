# Doc365: Trusted Health Records for Sri Lanka (learning prototype)

## Current status (updated 2026-11-07)
- Phases 0-5 DONE. `npm test` (in `server/`): 125 tests, all passing.
- Phase 5 complete:
  - Three Keys Rule: Card scan + active doctor session + registered hospital creates a scoped 90-day AccessGrant ledger entry.
  - Sensitive records require Card + Patient PIN verification (bcrypt cost 12).
  - Document hiding via separate consent ledger (`HiddenRecord`), preserving append-only clinical records.
  - Provider blocking (`PatientProviderBlock`) with immediate revocation of active grants.
  - Patient opt-out and opt-in controls.
  - Emergency summary (`GET /patients/:healthId/emergency`) cardless minimal facts.
  - Emergency break-glass override (`POST /access/break-glass`, `EMERGENCY_OVERRIDE_ACCESSED`) with mandatory justification and high-priority audit trail.
  - Parental controls (<16 years) vs independent access (>=16 years).
  - Access ledger timeline ("Who viewed my record").
- NEXT STEP: Wait for user direction to begin Phase 6 (E-prescriptions and medication list).

A health card for every citizen. A doctor scans the card and sees the patient's
complete, verified history from every hospital and lab. Inspired by Germany (eGK + ePA),
Taiwan (NHI card + MediCloud), Estonia, India (ABDM) and the UK.

**Read `docs/DESIGN.md` before writing any code.** It holds every design decision
(health card, three keys rule, access levels, roles, write rules).

This is a portfolio/learning project by a second-year Software Technology student
(beginner programmer). It is NOT a production medical system.

## Rules for Claude Code (important)
1. Learning mode: small steps. After creating or changing a file, explain in simple
   English what it does and why. Prefer simple, readable code over clever code.
2. One phase at a time. Do not start the next phase until I say so.
   Inside a phase, work through all steps on your own: run the tests and commit after
   each step that passes. Only stop and ask me for:
   (a) migration SQL, before applying it,
   (b) security decisions,
   (c) anything that conflicts with `docs/DESIGN.md`.
   Keep explanations short: what you did, what to check, what's next.
3. Ask before adding any dependency that is not listed in "Tech stack".
4. Fake data only. Never real people, real NIC numbers or real PHNs. Health IDs use the `DEMO-` prefix.
5. Secrets: private keys in `keys/`, config in `.env`. Both are gitignored. Never commit them.
6. Use Node.js built-in `crypto` for signing and hashing. Never write custom crypto.
   Passwords and PINs are hashed (bcrypt), never stored as plain text.
7. Every phase ends with something I can run (a script, a test, or an HTTP request) to see it working.
8. Follow `docs/DESIGN.md`. If something there seems wrong or unclear, ask me, don't silently change it.

## Tech stack
- Node.js 20+ (JavaScript, ES modules)
- Backend: Express, PostgreSQL 16+, Prisma (ORM + migrations)
- Auth: JWT (jsonwebtoken), bcrypt for passwords and PINs
- Validation: zod
- QR codes: qrcode
- Tests: Node's built-in test runner (`node --test`), supertest for API tests
- Frontend (Phase 7): Next.js + Tailwind CSS
- Health data format: HL7 FHIR R4 JSON (Patient, Observation, DiagnosticReport,
  MedicationRequest, MedicationDispense, AllergyIntolerance, Provenance),
  stored as JSONB in PostgreSQL. Aim to stay close to the Sri Lanka FHIR
  Implementation Guide direction (PHN as patient identifier).
- Signatures: Ed25519, JSON canonicalized (sorted keys) before signing.

## Technical decisions (approved; future sessions must not undo these)
- Prisma pinned to exactly 6.19.3 (`prisma` and `@prisma/client`). Do not upgrade:
  Prisma 7+ needs a driver adapter package that is not in the tech stack.
- Express 5.3.0.
- No `dotenv`. The single `.env` lives in the repo root and is loaded with Node's
  `--env-file=../.env`. Run Prisma CLI through the npm script, never plain `npx prisma`
  (it cannot see the root `.env`): `npm run prisma -- <command>`, `npm run db:migrate`,
  `npm run db:generate`.
- Known and accepted: `npm audit` reports 3 high warnings (`deepmerge-ts` inside the
  `prisma` CLI, dev-only). The only fix is a forced upgrade to Prisma 7, so leave them.
  Do not run `npm audit fix --force`.
- Local development uses PostgreSQL 18 on Windows (no Docker); `docker-compose.yml` is
  kept as an option.
- Always create migrations with `--create-only` first, show the SQL, and apply only
  after approval.
- Adding a required (NOT NULL) column to a table with real data must use
  expand and contract, never a reset: (1) add the column as nullable, (2) backfill
  every row, (3) set NOT NULL in a later migration. Resetting is only for the test
  database.
- Tests run on a separate `doc365_test` database, never the dev database. Settings are
  in `.env.test` (gitignored; copy from the committed `.env.test.example`).
  `npm test` first runs `migrate deploy` on the test database (`pretest`), then runs
  `test/**/*.test.js`. Every test file imports `test/guard.js` first; it refuses to run
  unless the database name ends in `_test`.
- Tests never delete data (the audit log becomes append-only in Phase 3). They use
  random IDs (e.g. `DEMO-TEST-<uuid>`) so runs never clash.
- `npm run db:test:reset` wipes the test database and re-applies all migrations
  (`scripts/reset-test-db.js`; refuses any database not ending in `_test`). The user
  runs it, not Claude (Prisma blocks `migrate reset` when run by an AI agent).
  The AuditLog triggers block UPDATE, DELETE and TRUNCATE, but a reset drops the whole
  schema (tables, triggers and all), which triggers cannot block. So the test database
  can always be reset. Never reset a database with real data.
- Hand-written SQL in the Phase 2 migration (Prisma cannot express it):
  partial unique index `Card_one_active_per_patient` and CHECK
  `GuardianLink_not_own_guardian`. Check every new migration does not drop them.
- Patient columns are the source of truth. The `fhir` JSON is always rebuilt from the
  columns in the same transaction, never edited on its own.
- GuardianLink rows are never deleted (not even at 16). Guardian access ending at 16
  is calculated from the child's dateOfBirth (`guardianAccessActive()` in
  `src/patients/age.js`); the link stays as history.
- Dates of birth are date-only values (UTC midnight). "Today" is the date in Sri Lanka
  (`todayInSriLanka()`); services take an optional `today` so tests use a fixed date.
- `npm run seed` (dev database) is idempotent: fixed Luhn-valid Health IDs
  (DEMO-100001-7, DEMO-100002-5, DEMO-100003-3), every step skipped if already done.
  Phase 3 adds 5 facilities (Demo Lab Colombo keeps its Phase 1 key; others get new
  Ed25519 keys in keys/) and accounts admin, registrar, dr.perera (two hospitals),
  mlt.silva, pharm.fernando, kumari (patient account). All use SEED_PASSWORD from
  .env (never printed, never in code).
- Card serials come from `crypto` random bytes, never counters. Issuing a replacement
  card blocks/replaces the old card and creates the new one in one transaction.
- The `nic` column is plain nullable unique text (no migration for NIC rules). Every NIC
  goes through `normalizeNic()` (`src/patients/nic.js`) before saving AND before
  searching: `DEMO-NIC-` prefix required, old form converted with the DRP rule text,
  day-of-year checked, invalid NICs rejected (AppError INVALID_NIC). See DESIGN.md section 1.
- Auth (approved security decisions, Phase 3):
  - bcrypt cost 12. JWT HS256 with `JWT_SECRET` (server refuses to start if shorter
    than 32 characters), valid 15 minutes, no refresh tokens. The JWT holds only
    userId and membershipId (no names, no roles that could go stale).
  - Every request reloads the user and membership: a BLOCKED user or a non-ACTIVE
    membership is refused at once, not when the token expires.
  - Login errors are always "Invalid username or password"; when the username does
    not exist, bcrypt still compares against a dummy hash (same response time).
  - Failed logins are audited. If the typed username matches no user, store only
    "unknown username" (never the typed text: people type passwords into the username
    field, and the audit log can never be deleted). If it matches, store the userId.
  - Passwords and hashes never appear in logs or API responses.
  - ADMIN memberships only in AUTHORITY facilities (checked in code).

## Folder structure
```
docs/DESIGN.md        design decisions (read first)
docker-compose.yml    local PostgreSQL
.env.example          copy to .env
server/               Express API
  src/core/           trust core: canonicalize, sign, verify (DONE)
  src/                routes, services, middleware (added phase by phase)
  prisma/             schema + migrations
  scripts/            runnable demos and seed data
  data/               fake sample FHIR data
  keys/               private keys (gitignored)
  registry/           facility public keys
web/                  Next.js portals (Phase 7)
```

## Phases

### Phase 0: Setup and health check
- `server/` Express app with `GET /health` returning `{ status: "ok", db: "ok" }`.
- PostgreSQL via `docker compose up -d` (or local PostgreSQL 16), Prisma connected.
- Load config from `.env` (copy of `.env.example`).
- Done when: `npm run dev` in `server/` starts, and `/health` shows db ok.

### Phase 1: Trust core: DONE
- `src/core/canonicalize.js`, `sign.js`, `verify.js` already work.
- Check: `npm run keys` then `npm run demo:signing` shows VERIFIED, TAMPERED, VERIFIED, PATIENT_UPLOADED.
- Facility public keys now live in the database (Phase 3 Facility table; the seed copies
  Demo Lab Colombo's key from `registry/facilities.json`).

### Phase 2: Patients and health cards: DONE
- Tables: Patient (FHIR Patient JSON + Health ID + date of birth + NIC optional),
  Card (serial, status: ACTIVE / BLOCKED / REPLACED), Guardian links.
- Health ID generator with Luhn check digit (`DEMO-123456-6`).
- Register a newborn (with guardian), link NIC at 16, block and reissue a lost card.
- Card QR contains ONLY Health ID + card serial. Age is computed from date of birth, never stored.
- Done when: a seed script registers 3 fake patients (a baby, a teenager, an adult)
  and prints their cards' QR payloads, AND `npm test` passes these database tests
  (`server/test/db-rules.test.js`), which must fail if a migration drops the rules:
  - creating a second ACTIVE card for the same patient fails
  - a GuardianLink where childId equals guardianId fails
  - replacing a card leaves exactly one ACTIVE card and the old one BLOCKED

### Phase 3: Facilities, accounts and roles: DONE
- Tables: Facility (type: HOSPITAL / LAB / CLINIC / PHARMACY / AUTHORITY, public key),
  User (the person who logs in, optional own patientId), StaffMembership (user +
  facility + staff role + job title + status; a person can have several),
  AuditLog (append-only at the database level: trigger refuses UPDATE/DELETE/TRUNCATE).
  See DESIGN.md section 5.
- Login with JWT (15 minutes). A user with several memberships (or a patient record)
  chooses one at login; the JWT holds userId + membershipId. All role permissions are
  in ONE file (permission matrix), checked by one middleware; default deny (a route
  with no permission rule is refused).
- Every API request that touches patient data writes an AuditLog row (who, facility, what, when, why).
- AuditLog has no update or delete routes at all.
- Card changes are audited: blocking and replacing a card (Phase 2 `card-service.js`)
  must write an AuditLog row (who, facility, card serial, old and new status, reason),
  in the same transaction as the card change.
- Map AppError codes to HTTP responses (e.g. CARD_CHANGED_CONCURRENTLY -> 409 Conflict).
- Done when: tests prove a PHARMACIST cannot open a full record, a LAB_STAFF cannot
  correct another lab's result, an expired JWT is refused, a route with no permission
  rule is refused, and the database refuses UPDATE/DELETE/TRUNCATE on AuditLog.

### Phase 4: Records (signed, append-only): DONE
- The server NEVER signs on behalf of a facility (DESIGN.md section 4). The facility
  signs before sending: `scripts/lab-client.js` holds the lab's private key, signs a
  FHIR bundle and uploads `{ bundle, provenance }`.
- The server only VERIFIES, with the facility's public key from the database.
  TAMPERED or UNKNOWN_SIGNER uploads are rejected and audited. The signing facility
  must match the uploader's membership facility. The patient comes from the signed
  bundle's Health ID.
- Server code (`src/`) never reads `keys/`: a test fails if any file under `src/`
  references the keys folder.
- Corrections: same rules, signed by the same facility, allowed by
  `can(actor, 'record.correct', record)`, stored as a new version with status
  `amended` or `entered-in-error`. Old versions stay.
- No edit or delete endpoints for clinical records.
- Patient uploads stored with label PATIENT_UPLOADED.
- Done when: an amended result shows both versions in history, a tampered row is
  detected as TAMPERED, a TAMPERED / UNKNOWN_SIGNER / other-facility upload is
  rejected and audited, and the `src/` must-not-read-`keys/` test passes.

### Phase 5: Access engine (the heart of Doc365): DONE
- Card scan + logged-in doctor + registered facility → AccessGrant for 90 days (from `.env`).
- Sensitive records need card + patient PIN.
- Emergency summary endpoint; break-glass access needs a reason and is flagged in the audit log.
- Patient controls: block a facility/doctor, hide a document, opt out.
  ClinicalRecord is append-only, so "hide a document" is a SEPARATE table (e.g.
  patient + record lineage + hidden at/by), never a column on ClinicalRecord.
- "Who viewed my record" endpoint for the patient.
- Done when: tests cover all rows of the access table in DESIGN.md section 3.

### Phase 6: E-prescriptions and medication list
- Doctor issues signed MedicationRequest + QR. Pharmacy scans → sees only that prescription
  → records MedicationDispense; a dispensed prescription cannot be reused.
- Medication list builds automatically from prescriptions and dispenses.
- Duplicate-test alert and simple allergy check (demo data).
- Done when: a full script runs doctor → prescription → pharmacy → medication list.

### Phase 7: Web portals (Next.js + Tailwind)
- Doctor portal (scan card, emergency summary, timeline, trends, actions, who-viewed).
- Facility portal (labs/hospitals upload results), pharmacy portal, registration desk,
  patient portal, admin portal.
- Install `qrcode` here to draw card QR images. Phase 2 only prints the payload
  (`cardQrPayload()`: Health ID + card serial only).
- Done when: the full story works in the browser: register baby → lab uploads result →
  doctor scans card → sees verified result → writes prescription → pharmacy dispenses.
