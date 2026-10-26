// Seed for the DEV database. Run: npm run seed
// Phase 2: three fake patients
// - an adult (the baby's mother), registered with an old-form NIC
// - a baby, registered with the adult as guardian
// - a teenager (16+), registered without a NIC, then the NIC is linked at 16,
//   which renews the card (one REPLACED card, one ACTIVE card)
// Phase 3: facilities (with signing keys) and staff accounts with memberships,
// plus a patient account for the adult. All accounts use SEED_PASSWORD from .env.
// Idempotent: fixed Health IDs, codes and usernames; every step is skipped if it
// was already done. Running it twice creates nothing new. Fake data only.

import crypto from "node:crypto";
import fs from "node:fs";
import { prisma } from "../src/db.js";
import { systemActor } from "../src/audit/audit-log.js";
import { createFacility, createUser, createMembership } from "../src/auth/account-service.js";
import { registerPatient, registerNewborn, linkNic } from "../src/patients/patient-service.js";
import { cardQrPayload } from "../src/patients/card-service.js";
import { isValidHealthId } from "../src/patients/health-id.js";
import { ageOn, todayInSriLanka } from "../src/patients/age.js";

const ADULT = {
  healthId: "DEMO-100001-7",
  givenName: "Kumari",
  familyName: "Jayasinghe",
  fullName: "Herath Mudiyanselage Kumari Jayasinghe",
  sex: "female",
  dateOfBirth: "1990-08-03",
  nic: "DEMO-NIC-907150345V", // old form; saved as DEMO-NIC-199071500345
};

const BABY = {
  healthId: "DEMO-100002-5",
  familyName: "Jayasinghe", // no given name yet
  sex: "male",
  dateOfBirth: "2026-09-15",
};

const TEEN = {
  healthId: "DEMO-100003-3",
  givenName: "Sanduni",
  familyName: "Perera",
  sex: "female",
  dateOfBirth: "2009-05-14",
};
const TEEN_NIC = "DEMO-NIC-200963400127";

for (const person of [ADULT, BABY, TEEN]) {
  if (!isValidHealthId(person.healthId)) throw new Error(`Seed Health ID ${person.healthId} is not valid`);
}

const today = todayInSriLanka();
const actor = systemActor("seed");

function exists(healthId) {
  return prisma.patient.findUnique({ where: { healthId } });
}

function showWarnings(warnings) {
  for (const w of warnings) console.log(`  WARNING ${w.code}: ${w.message}`);
}

async function seed() {
  const { healthId: adultId, ...adultData } = ADULT;
  if (await exists(adultId)) {
    console.log(`skip   ${adultId} adult already exists`);
  } else {
    const { warnings } = await registerPatient(adultData, { healthId: adultId, today, actor });
    console.log(`create ${adultId} adult`);
    showWarnings(warnings);
  }

  const { healthId: babyId, ...babyData } = BABY;
  if (await exists(babyId)) {
    console.log(`skip   ${babyId} baby already exists`);
  } else {
    await registerNewborn(
      { child: babyData, guardianHealthId: adultId, relationship: "MOTHER" },
      { healthId: babyId, today, actor }
    );
    console.log(`create ${babyId} baby (guardian: ${adultId})`);
  }

  const { healthId: teenId, ...teenData } = TEEN;
  let teen = await exists(teenId);
  if (teen) {
    console.log(`skip   ${teenId} teenager already exists`);
  } else {
    await registerPatient(teenData, { healthId: teenId, today, actor });
    console.log(`create ${teenId} teenager (no NIC yet)`);
    teen = await exists(teenId);
  }
  if (teen.nic) {
    console.log(`skip   ${teenId} NIC already linked`);
  } else {
    const { warnings } = await linkNic(teenId, TEEN_NIC, { today, actor });
    console.log(`link   ${teenId} NIC linked, card renewed`);
    showWarnings(warnings);
  }
}

async function printCards() {
  console.log(`\n=== Seed patients (today in Sri Lanka: ${today.toISOString().slice(0, 10)}) ===`);
  for (const { healthId } of [ADULT, BABY, TEEN]) {
    const p = await prisma.patient.findUnique({
      where: { healthId },
      include: {
        cards: { orderBy: { issuedAt: "asc" } },
        guardians: { include: { guardian: true } },
      },
    });
    const name = p.fullName ?? [p.givenName, p.familyName].filter(Boolean).join(" ");
    console.log(`\n${p.healthId}  ${name}`);
    console.log(`  born ${p.dateOfBirth.toISOString().slice(0, 10)}, age ${ageOn(p.dateOfBirth, today)}, ${p.sex}`);
    console.log(`  NIC: ${p.nic ?? "(none)"}`);
    for (const g of p.guardians) {
      console.log(`  guardian: ${g.guardian.healthId} (${g.relationship})`);
    }
    for (const c of p.cards) {
      const ended = c.endedReason ? `  <- ${c.endedReason}` : "";
      console.log(`  card ${c.serial}  ${c.status}${ended}`);
    }
    const active = p.cards.find((c) => c.status === "ACTIVE");
    console.log(`  QR payload: ${cardQrPayload(p.healthId, active.serial)}`);
  }
}

// ---------- Phase 3: facilities and accounts ----------

const FACILITIES = [
  { code: "demo-moh", name: "Demo Ministry of Health", type: "AUTHORITY" },
  { code: "demo-general-hospital", name: "Demo General Hospital Colombo", type: "HOSPITAL" },
  { code: "demo-private-hospital", name: "Demo Private Hospital Kandy", type: "HOSPITAL" },
  { code: "demo-lab-colombo", name: "Demo Lab Colombo", type: "LAB" },
  { code: "demo-pharmacy", name: "Demo Pharmacy Colombo", type: "PHARMACY" },
];

const USERS = [
  { username: "admin", fullName: "N. Wickramasinghe", memberships: [["demo-moh", "ADMIN", "System Admin"]] },
  { username: "registrar", fullName: "S. Bandara", memberships: [["demo-general-hospital", "REGISTRAR", "Registration Officer"]] },
  {
    // Works at a government hospital AND channels at a private hospital
    username: "dr.perera",
    fullName: "R. Perera",
    memberships: [
      ["demo-general-hospital", "DOCTOR", "Dr."],
      ["demo-private-hospital", "DOCTOR", "Dr."],
    ],
  },
  { username: "mlt.silva", fullName: "A. Silva", memberships: [["demo-lab-colombo", "LAB_STAFF", "MLT"]] },
  { username: "pharm.fernando", fullName: "T. Fernando", memberships: [["demo-pharmacy", "PHARMACIST", "Pharmacist"]] },
  // The adult patient's own account (she is also the baby's guardian)
  { username: "kumari", fullName: "Kumari Jayasinghe", patientHealthId: ADULT.healthId, memberships: [] },
];

// The public key for a facility. Demo Lab Colombo keeps its Phase 1 key
// (registry/facilities.json) so Phase 1 signatures still verify. Other facilities
// get a new Ed25519 key pair: private key in keys/ (gitignored), public key returned.
function publicKeyFor(code) {
  if (code === "demo-lab-colombo") {
    const registry = JSON.parse(fs.readFileSync("registry/facilities.json", "utf8"));
    const entry = registry.facilities.find((f) => f.reference === `Organization/${code}`);
    if (!entry) throw new Error("Demo Lab Colombo is not in registry/facilities.json. Run: npm run keys");
    return entry.publicKeyPem;
  }
  const privatePath = `keys/${code}.private.pem`;
  if (!fs.existsSync(privatePath)) {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    fs.mkdirSync("keys", { recursive: true });
    fs.writeFileSync(privatePath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    console.log(`key    ${privatePath} created (secret, never commit)`);
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privatePath, "utf8"));
  return crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" });
}

async function seedFacilitiesAndAccounts() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("Set SEED_PASSWORD (at least 10 characters) in .env first");
  }

  const facilities = {};
  for (const f of FACILITIES) {
    facilities[f.code] = await prisma.facility.findUnique({ where: { code: f.code } });
    if (facilities[f.code]) {
      console.log(`skip   facility ${f.code}`);
      continue;
    }
    const publicKeyPem = f.type === "AUTHORITY" ? null : publicKeyFor(f.code);
    facilities[f.code] = await createFacility({ ...f, publicKeyPem }, { actor });
    console.log(`create facility ${f.code} (${f.type})`);
  }

  for (const u of USERS) {
    let user = await prisma.user.findUnique({ where: { username: u.username }, select: { id: true } });
    if (user) {
      console.log(`skip   user ${u.username}`);
    } else {
      const patient = u.patientHealthId
        ? await prisma.patient.findUnique({ where: { healthId: u.patientHealthId } })
        : null;
      user = await createUser({ username: u.username, password, fullName: u.fullName, patientId: patient?.id }, { actor });
      console.log(`create user ${u.username}`);
    }
    for (const [code, role, jobTitle] of u.memberships) {
      const facilityId = facilities[code].id;
      const exists = await prisma.staffMembership.findUnique({
        where: { userId_facilityId_role: { userId: user.id, facilityId, role } },
      });
      if (exists) continue;
      await createMembership({ userId: user.id, facilityId, role, jobTitle }, { actor });
      console.log(`create membership ${u.username}: ${role} at ${code}`);
    }
  }
}

async function printAccounts() {
  console.log("\n=== Seed accounts (password: SEED_PASSWORD in .env) ===");
  for (const u of USERS) {
    const user = await prisma.user.findUnique({
      where: { username: u.username },
      select: { fullName: true, patientId: true, memberships: { include: { facility: true } } },
    });
    const roles = user.memberships.map((m) => `${m.role} at ${m.facility.name}`);
    if (user.patientId) roles.push("own patient record");
    console.log(`  ${u.username.padEnd(15)} ${user.fullName.padEnd(20)} ${roles.join("; ")}`);
  }
}

try {
  await seed();
  await seedFacilitiesAndAccounts();
  await printCards();
  await printAccounts();
} finally {
  await prisma.$disconnect();
}
