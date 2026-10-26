// The LAB uses this. It signs a FHIR Bundle with the lab's private key and
// returns a FHIR Provenance resource that carries the signature.

import crypto from "node:crypto";
import { canonicalize } from "./canonicalize.js";

export function sha256Hex(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function signBundle(bundle, privateKeyPem, labReference) {
  const bytes = Buffer.from(canonicalize(bundle), "utf8");
  const privateKey = crypto.createPrivateKey(privateKeyPem);

  // Ed25519: pass null as the algorithm, it hashes internally.
  const signature = crypto.sign(null, bytes, privateKey);
  const now = new Date().toISOString();

  const report = bundle.entry.find((e) => e.resource.resourceType === "DiagnosticReport");

  return {
    resourceType: "Provenance",
    target: [{ reference: `DiagnosticReport/${report.resource.id}` }],
    recorded: now,
    agent: [{ who: { reference: labReference } }],
    signature: [
      {
        type: [
          {
            system: "urn:iso-astm:E1762-95:2013",
            code: "1.2.840.10065.1.12.1.5",
            display: "Verification Signature"
          }
        ],
        when: now,
        who: { reference: labReference },
        targetFormat: "application/fhir+json",
        // Demo: raw Ed25519 signature. Real systems usually use JWS (application/jose).
        sigFormat: "application/octet-stream",
        data: signature.toString("base64")
      }
    ]
  };
}
