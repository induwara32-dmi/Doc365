// Patients (DESIGN.md section 1): one record per person, for life.
// Registration and NIC linking will be added here in the next Phase 2 steps.
import { prisma } from '../db.js';
import { normalizeNic } from './nic.js';

// Find a patient by NIC. The NIC is normalized first (same function as when
// saving), so an old NIC like DEMO-NIC-855420159V finds a patient saved as
// DEMO-NIC-198554200159. Returns null if nobody has this NIC.
export async function findPatientByNic(nic) {
  return prisma.patient.findUnique({ where: { nic: normalizeNic(nic) } });
}
