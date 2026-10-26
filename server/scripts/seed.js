// Phase 2 seed: three fake patients in the DEV database. Run: npm run seed
// - an adult (the baby's mother), registered with an old-form NIC
// - a baby, registered with the adult as guardian
// - a teenager (16+), registered without a NIC, then the NIC is linked at 16,
//   which renews the card (one REPLACED card, one ACTIVE card)
// Idempotent: fixed Health IDs, and every step is skipped if it was already done.
// Running it twice creates nothing new. Fake data only (DEMO- prefixes).

import { prisma } from "../src/db.js";
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
    const { warnings } = await registerPatient(adultData, { healthId: adultId, today });
    console.log(`create ${adultId} adult`);
    showWarnings(warnings);
  }

  const { healthId: babyId, ...babyData } = BABY;
  if (await exists(babyId)) {
    console.log(`skip   ${babyId} baby already exists`);
  } else {
    await registerNewborn(
      { child: babyData, guardianHealthId: adultId, relationship: "MOTHER" },
      { healthId: babyId, today }
    );
    console.log(`create ${babyId} baby (guardian: ${adultId})`);
  }

  const { healthId: teenId, ...teenData } = TEEN;
  let teen = await exists(teenId);
  if (teen) {
    console.log(`skip   ${teenId} teenager already exists`);
  } else {
    await registerPatient(teenData, { healthId: teenId, today });
    console.log(`create ${teenId} teenager (no NIC yet)`);
    teen = await exists(teenId);
  }
  if (teen.nic) {
    console.log(`skip   ${teenId} NIC already linked`);
  } else {
    const { warnings } = await linkNic(teenId, TEEN_NIC, { today });
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

try {
  await seed();
  await printCards();
} finally {
  await prisma.$disconnect();
}
