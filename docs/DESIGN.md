# Doc365 Design Decisions

The "why" behind the system. CLAUDE.md says what to build; this file says why.
If code and this file disagree, ask before changing either.

## The problem (Sri Lanka)
- Records are scattered: government hospital, private hospital, separate lab.
- Patients carry paper reports between hospitals; reports get lost.
- Tests are repeated because old results are missing (wasted money).
- In an emergency, the doctor cannot see blood group, allergies or current medicines.
- The same medicine is prescribed by different doctors (interaction risk).

## Inspiration
- Germany (eGK card + ePA): card for everyone, record created automatically (opt-out),
  card scan gives treating doctors time-limited access, auto medication list from
  e-prescriptions, uploading is mandatory for doctors and hospitals, patient can block
  providers and hide documents, teenagers manage their own record.
- Taiwan (NHI card + MediCloud): "three-card" check: patient card + doctor card +
  institution card. Logged emergency access when the patient has no card.
- Estonia: patient sees every access to their record.
- India (ABDM): consent manager, QR scan-and-share at the counter.
- UK: emergency summary (Summary Care Record idea), proxy access for family.
- Sri Lanka NEHR is FHIR R4 based and uses the PHN. Doc365 stays compatible with that direction.

## Core rules

### 1. The health card is a key, not a storage device
- Card shows: name, photo, date of birth, Health ID (as QR), card serial.
- NO medical data on the card. Lost card: block it and issue a new one; no data is lost.
- Age is never stored. It is always calculated from date of birth.
- Issued at birth by the birth hospital. At age 16 (NIC age) the NIC is linked to the
  same record and the card is renewed with a new photo. One record for life.
- Demo Health ID format: `DEMO-` + 6 digits + `-` + check digit (Luhn).
  The DEMO prefix makes sure nobody mistakes it for a real PHN.
  Example: `DEMO-123456-6`.
- What the Luhn check digit catches: every single wrong digit, and almost every swap
  of two neighbouring digits. Known limit: swapping `09` <-> `90` is NOT detected
  (0 and 9 add the same amount to the Luhn sum whether doubled or not). Swapping two
  equal digits (e.g. `44`) changes nothing, so it is not an error. A typo can still
  produce another valid Health ID, so staff must always confirm the patient's name and
  date of birth (and photo, later) after a lookup.
- The photo matters for security: when a card is scanned without a PIN, staff use
  the photo to confirm the card holder is the patient. The prototype skips photos in
  Phase 2; a nullable `photoUrl` column on Card can be added in a later phase.
- NIC is stored as plain text with no format check: Sri Lanka has old NICs
  (9 digits + V/X) and new 12-digit NICs, and one person can have both.
  Demo data uses the `DEMO-NIC-` prefix so it can never match a real NIC.

### 2. The "three keys" rule
A full record opens only when ALL three are present:
1. Patient's health card (scanned)
2. A logged-in, registered doctor (individual account)
3. A registered facility (the doctor's hospital/clinic)
A stolen card alone is useless. A doctor alone cannot open a record without the card.

### 3. Access levels
| Situation | What is visible | How |
|---|---|---|
| Card scanned at a registered facility | Full record (except sensitive) for 90 days (configurable) | Three keys |
| Sensitive records (HIV, mental health, reproductive health) | Only with patient PIN | Card + PIN |
| Emergency, no card (patient unconscious) | Emergency summary only | Break-glass: reason required, logged, patient notified, reviewed later |
| Pharmacy | Only the scanned prescription | Prescription QR |

Emergency summary = blood group, allergies, long-term conditions, current medicines.

### 4. Write rules ("you can only add what you create")
- Nobody edits anyone else's record. Nobody deletes clinical records.
- Corrections create a new version (`amended` / `entered-in-error`); old versions stay.
- Every record from a facility is signed with that facility's key (FHIR Provenance).
- Patient uploads are allowed but always labelled PATIENT_UPLOADED (unverified).

### 5. Roles
| Role | View | Add | Correct |
|---|---|---|---|
| LAB_STAFF | Records their lab created | Lab results | Own lab's results only (new version) |
| HOSPITAL_STAFF | Full record via three keys | Admissions, discharge summaries, imaging reports | Own facility's records only |
| DOCTOR | Full record via three keys | Visit notes, e-prescriptions, test orders | Own entries only |
| PHARMACIST | Scanned prescription only | Dispense record | No |
| PATIENT | Own full record + who-viewed log | Patient uploads | No |
| GUARDIAN | Child's record until age 16; or as family representative | Same as patient | No |
| REGISTRAR | Patient demographics | New patients, cards, NIC linking | Demographics only |
| ADMIN | Audit logs | Facilities, staff accounts | Block accounts and cards |

Accounts are per PERSON, inside a facility. The audit log shows
"Demo Lab Colombo, MLT [name]", not just the lab.

### 6. Patient controls (app OR hospital service desk; many people have no smartphone)
- Block a specific facility or doctor.
- Hide a specific document.
- Opt out of the record, or out of anonymised research use.
- See every access ("who viewed my record").

### 7. Medicines
- Doctor issues a signed e-prescription with a QR code.
- Pharmacy scans it, sees ONLY that prescription, marks it dispensed (cannot be reused).
- Issuing and dispensing automatically build the patient's medication list.
- Duplicate-test alert: warn when the same test was done recently.
- Allergy/interaction checks use demo data only (a real system needs a licensed drug database).

## Lessons: what we do NOT copy from Germany
- Pharmacies do not get 3-day full-record access; only the scanned prescription.
- Patient controls are not app-only; a service desk route is required.

## Out of scope for the prototype
- Real patient data (never), real NIC/PHN numbers (never).
- NFC chip cards (QR is enough for the demo).
- Health ID size: 6 random digits give only 1 million IDs. Fine for the demo, but far
  too few for Sri Lanka (about 22 million people, plus every future birth). A real
  system would need a longer ID; also, random IDs get more clashes (retries) as the
  table fills up.
- Real SMS sending (log to console instead).
- Production security hardening, high availability.
