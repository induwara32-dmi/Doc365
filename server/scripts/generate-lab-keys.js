// Creates an Ed25519 key pair for the demo lab.
//   Private key -> keys/        (secret, gitignored, only the lab has it)
//   Public key  -> registry/    (public, everyone can use it to verify)
// Run: npm run keys            (add --force to replace an existing key)

import crypto from "node:crypto";
import fs from "node:fs";

const LAB = { reference: "Organization/demo-lab-colombo", name: "Demo Lab Colombo", slug: "demo-lab-colombo" };
const privatePath = `keys/${LAB.slug}.private.pem`;
const registryPath = "registry/facilities.json";
const force = process.argv.includes("--force");

if (fs.existsSync(privatePath) && !force) {
  console.log(`Key already exists at ${privatePath}. Use "npm run keys -- --force" to replace it.`);
  process.exit(0);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

fs.mkdirSync("keys", { recursive: true });
fs.writeFileSync(privatePath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });

const registry = fs.existsSync(registryPath)
  ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
  : { facilities: [] };

registry.facilities = registry.facilities.filter((f) => f.reference !== LAB.reference);
registry.facilities.push({
  reference: LAB.reference,
  name: LAB.name,
  publicKeyPem: publicKey.export({ type: "spki", format: "pem" })
});

fs.mkdirSync("registry", { recursive: true });
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");

console.log(`Private key saved: ${privatePath}  (keep secret, never commit)`);
console.log(`Public key added:  ${registryPath}`);
