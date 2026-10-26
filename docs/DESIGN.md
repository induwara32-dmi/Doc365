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
- NIC: Sri Lanka has old NICs (9 digits + V/X) and new 12-digit NICs (since 2016),
  and one person can have both. Doc365 stores ONE form: every NIC is normalized to
  the new 12-digit form before saving AND before searching, so the same person can
  never be registered twice under both forms, and a lookup by the old NIC still works.
  - Official rule (drp.gov.lk FAQ): drop the V/X, add "0" before the last 4 digits,
    start with "19". Example: 855420159V -> 198554200159. (The DRP page prints this
    example as "19 85542 0 159", which has only 11 digits; we follow the rule text.)
  - Strict: accept old (any case, spaces around trimmed) or new form, then check the
    day-of-year digits are 001-366 or 501-866 (women +500). Anything else is rejected
    with a clear error; an invalid NIC is never saved unchanged.
  - The V/X letter (voter status) is not kept; Doc365 has no use for it.
  - Demo NICs must start with `DEMO-NIC-` (real rules apply after it); NICs without
    the prefix are rejected, so a real NIC can never be entered by accident.
- Cross-check when linking a NIC (at 16): the NIC encodes birth year, day of the year
  and sex (+500 for women). It is compared with the patient's record:
  - Year or day-of-year mismatch: rejected (likely a typo or the wrong person).
  - February: no official source found for how the DRP counts it. Most unofficial
    sources say February always counts as 29 days (so in a normal year 1 March = 061,
    31 December = 366); one says the real calendar (1 March = 060). Until an official
    source settles it, a NIC is accepted if EITHER rule matches. The two rules are
    separate entries in `NIC_DAY_RULES` (`src/patients/nic.js`) so one can be dropped
    later (also update the tests that use it). The two rules differ by at most one
    day, so real typos (wrong year, month, or +500) are still caught.
  - Sex mismatch (the +500 part): NOT rejected. Staff get a warning to confirm with
    the patient, because the sex in the record and the sex encoded when the NIC was
    issued can legitimately differ (a registration error, or a later change).
    The sex check is skipped when the record says `other` or `unknown`.

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
| REGISTRAR | Patient demographics | New patients, cards, NIC linking | Demographics only |
| ADMIN | Audit logs | Facilities, staff accounts | Block accounts and cards |
| *PATIENT (access, not a role)* | Own full record + who-viewed log | Patient uploads | No |
| *Guardian (access, not a role)* | Child's record until age 16 | Same as patient, for the child | No |

**Accounts: one per PERSON, roles per membership.** In Sri Lanka one person often
works in several places (a doctor in a government hospital who also channels at
private hospitals), a doctor can also be a patient, and a mother is both a patient
and a guardian. So:
- A **User** is the person who logs in (username, password, name). A user may be
  linked to their own patient record.
- A **StaffMembership** is one role at one facility (user + facility + role + job
  title + status). The roles in the table above are membership roles. One person can
  have several memberships; at login they choose one, and everything they do in that
  session is checked and audited for that membership.
- **ADMIN** is a membership in an AUTHORITY facility (e.g. "Demo Ministry of Health").
- Each staff role is only allowed at certain facility types:

  | Role | Allowed facility types |
  |---|---|
  | DOCTOR | HOSPITAL, CLINIC |
  | HOSPITAL_STAFF | HOSPITAL |
  | LAB_STAFF | LAB |
  | PHARMACIST | PHARMACY |
  | REGISTRAR | HOSPITAL, AUTHORITY |
  | ADMIN | AUTHORITY |

  This is checked in code (memberships are created rarely, by an admin, through one
  code path). The pairs are data in the permission matrix file
  (`src/auth/permissions.js`), next to the role permissions.
- A hospital's in-house lab and pharmacy are registered as **separate facilities**
  (type LAB and PHARMACY), each with its own signing key. So a lab result from the
  hospital lab is signed by the lab, and LAB_STAFF there are members of the lab, not
  of the hospital.
- **PATIENT** is not a membership role: a user linked to a patient record can log in
  as that patient and see their own record.
- **Guardian** is not a role either: a patient user sees a child's record while a
  GuardianLink exists AND the child is under 16 (calculated from the child's date of
  birth every time; the link is never deleted). Adult family representatives
  (proxy access for adults) are not in the prototype.

The audit log shows the membership, e.g. "Demo Lab Colombo, MLT [name]", not just
the lab or just the person.

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
- NIC special cases: under section 19(2) (dual citizenship) the old NIC number is
  cancelled and a new one issued. The prototype does not handle cancelled NICs.
- Health ID size: 6 random digits give only 1 million IDs. Fine for the demo, but far
  too few for Sri Lanka (about 22 million people, plus every future birth). A real
  system would need a longer ID; also, random IDs get more clashes (retries) as the
  table fills up.
- Real SMS sending (log to console instead).
- Production security hardening, high availability. In particular:
  - No login lockout or rate limiting (failed logins are audited).
  - The AuditLog trigger stops every normal query, including our own code, but the
    table owner (the `doc365` database user) could still deliberately drop the
    trigger. Real protection needs the app to connect as a separate database user
    that does not own the tables.
