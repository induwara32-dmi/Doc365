// ALL role permissions in ONE place (DESIGN.md section 5). Checked by one
// middleware (src/http/secure-router.js). DEFAULT DENY: a permission that is not
// listed here, or a role that is not listed under it, is refused.

// ---------- Which staff role may work at which facility type ----------
// (DESIGN.md section 5; checked when a membership is created)
export const ALLOWED_FACILITY_TYPES = {
  DOCTOR: ['HOSPITAL', 'CLINIC'],
  HOSPITAL_STAFF: ['HOSPITAL'],
  LAB_STAFF: ['LAB'],
  PHARMACIST: ['PHARMACY'],
  REGISTRAR: ['HOSPITAL', 'AUTHORITY'],
  ADMIN: ['AUTHORITY'],
};

// ---------- The permission matrix ----------
// Who acts: a staff role from their chosen membership, or PATIENT (logged in as
// themselves, see DESIGN.md section 5).
// Rule values:
//   ALWAYS        the role may do this (later phases add more checks, e.g. the
//                 three keys rule for full records in Phase 5)
//   OWN_FACILITY  only on things created by the actor's own facility
//   OWN_ENTRY     only on things the actor created themselves
//   PUBLIC        no login needed (only for logging in)
export const ALWAYS = 'always';
export const OWN_FACILITY = 'own-facility';
export const OWN_ENTRY = 'own-entry';
export const PUBLIC = 'public';

export const PATIENT = 'PATIENT';

export const PERMISSIONS = {
  'auth.login': PUBLIC,

  'session.view_self': {
    DOCTOR: ALWAYS,
    HOSPITAL_STAFF: ALWAYS,
    LAB_STAFF: ALWAYS,
    PHARMACIST: ALWAYS,
    REGISTRAR: ALWAYS,
    ADMIN: ALWAYS,
    [PATIENT]: ALWAYS,
  },

  // Full record: never PHARMACIST, LAB_STAFF, REGISTRAR or ADMIN (DESIGN.md section 5).
  // Phase 5 adds the three keys rule on top of this.
  'record.view_full': { DOCTOR: ALWAYS, HOSPITAL_STAFF: ALWAYS },
  // A lab sees only the records it created
  'record.view_created': { LAB_STAFF: OWN_FACILITY },
  'record.view_own': { [PATIENT]: ALWAYS },
  // Corrections are new versions (Phase 4), only of your own (facility's) records
  'record.correct': { LAB_STAFF: OWN_FACILITY, HOSPITAL_STAFF: OWN_FACILITY, DOCTOR: OWN_ENTRY },

  // A pharmacy sees only the scanned prescription (Phase 6)
  'prescription.view_scanned': { PHARMACIST: ALWAYS },

  'patient.view_demographics': { REGISTRAR: ALWAYS },
  'patient.register': { REGISTRAR: ALWAYS },
  'patient.link_nic': { REGISTRAR: ALWAYS },

  'card.block': { REGISTRAR: ALWAYS, ADMIN: ALWAYS },
  'card.replace': { REGISTRAR: ALWAYS },

  'audit.view': { ADMIN: ALWAYS },
  'account.manage': { ADMIN: ALWAYS },
  'facility.manage': { ADMIN: ALWAYS },
};

// The rule for this actor's role, or null (= denied)
export function ruleFor(actor, permission) {
  const rules = PERMISSIONS[permission];
  if (!rules) return null; // no rule for this permission: default deny
  if (rules === PUBLIC) return PUBLIC;
  return rules[actor?.role] ?? null;
}

// May this actor do this? `resource` is only needed for OWN_FACILITY / OWN_ENTRY
// rules; it must have `facilityId` / `createdByUserId`.
export function can(actor, permission, resource) {
  const rule = ruleFor(actor, permission);
  if (rule === PUBLIC || rule === ALWAYS) return true;
  if (rule === OWN_FACILITY) return Boolean(resource && actor.facilityId && resource.facilityId === actor.facilityId);
  if (rule === OWN_ENTRY) return Boolean(resource && actor.userId && resource.createdByUserId === actor.userId);
  return false;
}
