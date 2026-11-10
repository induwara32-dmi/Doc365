# Doc365 — Decentralized FHIR-Compliant Electronic Health Record & E-Prescription Network

Doc365 is a production-grade, zero-trust, decentralized health data exchange platform designed to bridge the interoperability gap between private hospitals, government clinics, diagnostic laboratories, and community pharmacies. Inspired by Estonia's e-Health system and Germany's Electronic Patient Record (ePA), Doc365 enforces end-to-end patient record interoperability, clinical safety, and patient self-sovereignty without relying on a vulnerable, centralized data store.

---

## 🌟 Key Architecture & Security Pillars

### 1. "Three-Keys" Access Engine (Zero-Trust Model)
Clinical access is governed strictly by the simultaneous presence of three independent trust factors:
* **Key 1 (Practitioner Identity):** Authenticated clinical session under strict Role-Based Access Control (RBAC).
* **Key 2 (Facility Context):** Verified registration with an authorized healthcare institution (Hospital, Clinic, Lab, or Pharmacy).
* **Key 3 (Physical NFC Card Tap):** Physical citizen presence verified via Health Card scan (Luhn-checked Universal Health ID + Card Serial), establishing an immutable, time-limited **90-Day Clinical Access Grant**.

### 2. Cryptographic Integrity & Immutability
* **Client-Side Facility Signing (Ed25519):** Diagnostic facilities and clinics sign HL7 FHIR bundles locally using their private Ed25519 keys. The server verifies public keys without ever holding or storing private keys.
* **PostgreSQL Append-Only Lineage:** Database-level triggers (`refuse_change_append_only`) enforce complete record immutability by rejecting any `UPDATE`, `DELETE`, or `TRUNCATE` operations on clinical records.
* **Deterministic Canonical Hashing:** JSON key ordering normalization (RFC 8785) ensures duplicate submission prevention and tamper detection.

### 3. Closed-Loop E-Prescriptions & Scoped Pharmacy Privacy
* **HL7 FHIR MedicationRequest:** Doctors author digitally signed electronic prescriptions.
* **Deterministic Clinical Safety Matrix:** Real-time checking against dangerous Drug-Drug Interactions (DDIs) (e.g., Warfarin + NSAIDs, ACE inhibitors + Spironolactone), therapeutic duplications, and allergy contraindications (e.g., Penicillin allergies vs. Amoxicillin) with mandatory clinical justification override logs.
* **Scoped Counter Privacy:** Pharmacists scanning prescription QR codes receive **only** the target prescription payload and minimal patient demographics for counter identification. Full medical records remain strictly inaccessible.
* **Anti-Re-Use State Machine:** Dispensed prescriptions transition to `DISPENSED` (stamped with a prominent Red Badge), raising immediate `HTTP 409 Conflict` blocks against re-dispense attempts across any pharmacy.

### 4. Diagnostic Worklist & Observation Analytics
* **HL7 FHIR ServiceRequest & DiagnosticReport:** Doctors issue investigation orders directly to patient records; accredited laboratories fulfill worklists by inputting structured LOINC observations (values, units, and reference intervals).
* **Interactive Health Trends (Patient Portal):** Historical observations (Fasting Blood Glucose, HbA1c, Total Cholesterol, Serum Creatinine) are parsed into dynamic SVG trend curves with automated status tagging (`NORMAL`, `ELEVATED`, `HIGH`).

### 5. Emergency Break-Glass & Self-Sovereignty
* **Emergency Break-Glass Override:** For cardless or unconscious trauma patients, doctors can invoke a 24-hour emergency override with a mandatory, auditable justification note (minimum 10 characters).
* **Patient Self-Sovereignty:** Patients can hide/unhide specific records (Document Masking), block practitioners/facilities (instantly revoking grants), set a confidential 4-6 digit PIN for sensitive records (HIV, mental health), or view the complete "Who Viewed My Records" immutable access audit ledger.

---

## 🏗️ Multi-Role Modern Web Portals

| Portal | Route | Primary Capabilities |
| :--- | :--- | :--- |
| **Portal Hub** | `/` | Central command dashboard with one-click test persona launchers. |
| **Doctor Portal** | `/doctor` | Header-integrated `Ctrl+K` card scanner, Patient hero summary, E-Prescription pad with live DDI interceptor, and Lab Order issuer. |
| **Pharmacy Portal** | `/pharmacy` | Scoped QR prescription lookup, Dispense execution, and duplicate reuse prevention alerts. |
| **Laboratory Portal** | `/lab` | Pending investigation worklist, structured LOINC result input, and client-side Ed25519 bundle signing. |
| **Patient Portal** | `/patient` | Digital Health Card preview, Access Ledger audit, Document Masking, PIN setup, and Biometric Health Trend charts. |

---

## 🛠️ Technology Stack

* **Frontend:** Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons, Canvas/SVG QR Engine
* **Backend:** Node.js, Express REST API, Prisma ORM, JSON Web Tokens (JWT)
* **Database:** PostgreSQL 16 (Append-only custom triggers, partial indexes, schema constraints)
* **Healthcare Standard:** HL7 FHIR R4 JSON Specifications (`MedicationRequest`, `ServiceRequest`, `DiagnosticReport`, `Observation`)
* **Cryptography:** Ed25519 (Asymmetric Digital Signatures), SHA-256 Canonical Hashing, bcrypt
* **Automated Testing:** Native Node.js Test Runner / Vitest / Supertest (**139 Passing Tests**, 0 Failures)
* **DevOps & Containerization:** Docker, Docker Compose

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v20 or higher
* **Docker Desktop**: Running locally
* **Git**

### 1. Clone & Set Environment
```bash
git clone [https://github.com/induwara32-dmi/Doc365.git](https://github.com/induwara32-dmi/Doc365.git)
cd Doc365
cp .env.example .env
