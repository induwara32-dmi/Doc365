// Builds the FHIR R4 Patient resource from the Patient table columns.
// Pure function: columns in, FHIR JSON out. No database, no clock.
// The columns are the source of truth (CLAUDE.md): this JSON is rebuilt from
// them in the same transaction every time they change, never edited on its own.

// Identifier systems. The Health ID plays the role of the PHN (Sri Lanka FHIR
// direction); the "demo" in both makes clear these are not real numbers.
export const HEALTH_ID_SYSTEM = 'urn:doc365:demo-phn';
export const NIC_SYSTEM = 'urn:doc365:demo-nic';

export function buildFhirPatient({ id, healthId, nic, givenName, familyName, fullName, sex, dateOfBirth }) {
  const identifier = [{ use: 'official', system: HEALTH_ID_SYSTEM, value: healthId }];
  if (nic) identifier.push({ use: 'secondary', system: NIC_SYSTEM, value: nic });

  // FHIR never uses null: optional parts are left out when empty.
  const name = { use: 'official', family: familyName };
  if (givenName) name.given = givenName.split(/\s+/); // FHIR: one entry per given name
  if (fullName) name.text = fullName; // exactly as on the birth certificate or NIC

  return {
    resourceType: 'Patient',
    id,
    identifier,
    name: [name],
    gender: sex, // our Sex values are the FHIR values
    birthDate: dateOfBirth.toISOString().slice(0, 10), // YYYY-MM-DD
  };
}
