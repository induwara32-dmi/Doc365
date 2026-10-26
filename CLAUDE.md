# Doc365: Trusted Health Records for Sri Lanka (learning prototype)

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
3. Ask before adding any dependency that is not listed in "Tech stack".
4. Fake data only. Never real people, real NIC numbers or real PHNs. Health IDs use the `DEMO-` prefix.
5. Secrets: private keys in `keys/`, config in `.env`. Both are gitignored. Never commit them.
6. Use Node.js built-in `crypto` for signing and hashing. Never write custom crypto.
   Passwords and PINs are hashed (bcrypt), never stored as plain text.
7. Every phase ends with something I can run (a script, a test, or an HTTP request) to see it working.
8. Follow `docs/DESIGN.md`. If something there seems wrong or unclear, ask me, don't silently change it.

## Tech stack
- Node.js 20+ (JavaScript, ES modules)
- Backend: Express, PostgreSQL 16, Prisma (ORM + migrations)
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
- In later phases, move facility public keys from `registry/facilities.json` into the database.

### Phase 2: Patients and health cards
- Tables: Patient (FHIR Patient JSON + Health ID + date of birth + NIC optional),
  Card (serial, status: ACTIVE / BLOCKED / REPLACED), Guardian links.
- Health ID generator with Luhn check digit (`DEMO-123456-7`).
- Register a newborn (with guardian), link NIC at 16, block and reissue a lost card.
- Card QR contains ONLY Health ID + card serial. Age is computed from date of birth, never stored.
- Done when: a seed script registers 3 fake patients (a baby, a teenager, an adult)
  and prints their cards' QR payloads.

### Phase 3: Facilities, accounts and roles
- Tables: Facility (type: HOSPITAL / LAB / CLINIC / PHARMACY, public key), User (person,
  belongs to a facility, role from DESIGN.md), AuditLog (append-only).
- Login with JWT. Middleware checks role permissions per DESIGN.md section 5.
- Every API request that touches patient data writes an AuditLog row (who, facility, what, when, why).
- AuditLog has no update or delete routes at all.
- Done when: tests prove a PHARMACIST cannot open a full record and a LAB_STAFF cannot edit another lab's result.

### Phase 4: Records (signed, append-only)
- Labs and hospitals upload FHIR results; the server signs them with the facility key
  and stores a Provenance resource.
- Corrections create a new version with status `amended` or `entered-in-error`.
- No edit or delete endpoints for clinical records.
- Patient uploads stored with label PATIENT_UPLOADED.
- Done when: an amended result shows both versions in history, and a tampered row is detected as TAMPERED.

### Phase 5: Access engine (the heart of Doc365)
- Card scan + logged-in doctor + registered facility → AccessGrant for 90 days (from `.env`).
- Sensitive records need card + patient PIN.
- Emergency summary endpoint; break-glass access needs a reason and is flagged in the audit log.
- Patient controls: block a facility/doctor, hide a document, opt out.
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
- Done when: the full story works in the browser: register baby → lab uploads result →
  doctor scans card → sees verified result → writes prescription → pharmacy dispenses.
