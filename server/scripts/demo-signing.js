// Phase 1 demo: sign a lab report, then show what the doctor's system sees
// in four situations. Run: npm run demo

import fs from "node:fs";
import { canonicalize } from "../src/core/canonicalize.js";
import { signBundle, sha256Hex } from "../src/core/sign.js";
import { verifyReport, TRUST } from "../src/core/verify.js";

const PRIVATE_KEY_PATH = "keys/demo-lab-colombo.private.pem";
const LAB_REF = "Organization/demo-lab-colombo";

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error("No lab key found. Run: npm run keys");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync("data/sample-report.json", "utf8"));
const registry = JSON.parse(fs.readFileSync("registry/facilities.json", "utf8"));
const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");

const icons = {
  [TRUST.VERIFIED]: "✅",
  [TRUST.TAMPERED]: "❌",
  [TRUST.UNKNOWN_SIGNER]: "⚠️ ",
  [TRUST.PATIENT_UPLOADED]: "⚠️ "
};

function glucoseOf(bundle) {
  return bundle.entry.find((e) => e.resource.id === "obs-glucose-0001").resource.valueQuantity.value;
}

function show(title, bundle, provenance) {
  const result = verifyReport(bundle, provenance, registry);
  console.log(`\n${title}`);
  console.log(`   Glucose value seen by doctor: ${glucoseOf(bundle)} mg/dL`);
  console.log(`   ${icons[result.status]} ${result.status}: ${result.reason}`);
}

console.log("=== Doc365 Phase 1: Signed lab reports ===");

// 1. The lab signs the report
const provenance = signBundle(report, privateKeyPem, LAB_REF);
console.log("\n[Lab] Report signed by Demo Lab Colombo");
console.log(`   SHA-256 of report: ${sha256Hex(canonicalize(report)).slice(0, 32)}...`);
console.log(`   Signature:         ${provenance.signature[0].data.slice(0, 32)}...`);

// 2. Original report -> VERIFIED
show("1) Original report from the lab", report, provenance);

// 3. Someone changes the glucose value -> TAMPERED
const tampered = structuredClone(report);
tampered.entry.find((e) => e.resource.id === "obs-glucose-0001").resource.valueQuantity.value = 95;
show("2) Someone edited glucose 126 -> 95", tampered, provenance);

// 4. Same data, keys in a different order -> still VERIFIED (canonicalization works)
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).reverse()) out[key] = reverseKeys(value[key]);
  return out;
}
const reordered = reverseKeys(report);
show("3) Same data, JSON keys in different order", reordered, provenance);

// 5. Patient uploads an old paper report (no lab signature) -> PATIENT_UPLOADED
show("4) Patient uploaded an old paper report", report, null);

fs.mkdirSync("output", { recursive: true });
fs.writeFileSync("output/provenance.json", JSON.stringify(provenance, null, 2) + "\n");
console.log("\nSaved the FHIR Provenance resource to output/provenance.json");
