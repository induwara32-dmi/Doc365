// The DOCTOR's system uses this. It checks whether a report really came from
// the lab and was not changed after signing.

import crypto from "node:crypto";
import { canonicalize } from "./canonicalize.js";

export const TRUST = {
  VERIFIED: "VERIFIED",                 // valid signature from a registered lab
  TAMPERED: "TAMPERED",                 // signature does not match the data
  UNKNOWN_SIGNER: "UNKNOWN_SIGNER",     // signer is not in the facility registry
  PATIENT_UPLOADED: "PATIENT_UPLOADED"  // no lab signature at all (unverified)
};

export function verifyReport(bundle, provenance, registry) {
  if (!provenance || !provenance.signature || provenance.signature.length === 0) {
    return { status: TRUST.PATIENT_UPLOADED, reason: "No lab signature. Treat as unverified." };
  }

  const sig = provenance.signature[0];
  const signer = sig.who.reference;
  const facility = registry.facilities.find((f) => f.reference === signer);

  if (!facility) {
    return { status: TRUST.UNKNOWN_SIGNER, reason: `${signer} is not a registered facility.` };
  }

  const bytes = Buffer.from(canonicalize(bundle), "utf8");
  const publicKey = crypto.createPublicKey(facility.publicKeyPem);
  const ok = crypto.verify(null, bytes, publicKey, Buffer.from(sig.data, "base64"));

  return ok
    ? { status: TRUST.VERIFIED, reason: `Signed by ${facility.name}. Data unchanged.` }
    : { status: TRUST.TAMPERED, reason: "Signature does not match. Data was changed after signing." };
}
