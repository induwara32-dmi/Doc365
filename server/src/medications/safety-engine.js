// Drug-Drug Interaction (DDI), Duplicate Therapy, and Allergy Safety Engine.
// Evaluates candidate prescriptions against active medications and patient allergies.
// A real production deployment would use a licensed drug knowledge base (e.g. BNF, First Databank, RxNorm).
// This engine implements deterministic rules for high-risk clinical pairs common in primary care.

import { prisma } from '../db.js';

// Standardized drug catalogue for prototype
export const DRUG_CATALOGUE = {
  // Antibiotics
  'AMOX-500': { code: 'AMOX-500', name: 'Amoxicillin 500mg capsules', class: 'PENICILLIN', generic: 'Amoxicillin' },
  'CLARITH-500': { code: 'CLARITH-500', name: 'Clarithromycin 500mg tablets', class: 'MACROLIDE', generic: 'Clarithromycin' },
  'CIPRO-500': { code: 'CIPRO-500', name: 'Ciprofloxacin 500mg tablets', class: 'FLUOROQUINOLONE', generic: 'Ciprofloxacin' },

  // Analgesics & Anti-inflammatories
  'IBU-400': { code: 'IBU-400', name: 'Ibuprofen 400mg tablets', class: 'NSAID', generic: 'Ibuprofen' },
  'DICLO-50': { code: 'DICLO-50', name: 'Diclofenac Sodium 50mg tablets', class: 'NSAID', generic: 'Diclofenac' },
  'ASP-75': { code: 'ASP-75', name: 'Aspirin 75mg tablets', class: 'SALICYLATE_NSAID', generic: 'Aspirin' },
  'PARA-500': { code: 'PARA-500', name: 'Paracetamol 500mg tablets', class: 'ANALGESIC', generic: 'Paracetamol' },
  'TRAM-50': { code: 'TRAM-50', name: 'Tramadol 50mg capsules', class: 'OPIOID', generic: 'Tramadol' },

  // Cardiovascular & Anticoagulants
  'WARF-5': { code: 'WARF-5', name: 'Warfarin Sodium 5mg tablets', class: 'ANTICOAGULANT', generic: 'Warfarin' },
  'LISIN-10': { code: 'LISIN-10', name: 'Lisinopril 10mg tablets', class: 'ACE_INHIBITOR', generic: 'Lisinopril' },
  'LOSAR-50': { code: 'LOSAR-50', name: 'Losartan Potassium 50mg tablets', class: 'ARB', generic: 'Losartan' },
  'SPIRON-25': { code: 'SPIRON-25', name: 'Spironolactone 25mg tablets', class: 'POTASSIUM_SPARING_DIURETIC', generic: 'Spironolactone' },
  'ATOR-20': { code: 'ATOR-20', name: 'Atorvastatin 20mg tablets', class: 'STATIN', generic: 'Atorvastatin' },
  'SIMV-20': { code: 'SIMV-20', name: 'Simvastatin 20mg tablets', class: 'STATIN', generic: 'Simvastatin' },
  'METO-50': { code: 'METO-50', name: 'Metoprolol 50mg tablets', class: 'BETA_BLOCKER', generic: 'Metoprolol' },

  // Psychiatry
  'SERT-50': { code: 'SERT-50', name: 'Sertraline 50mg tablets', class: 'SSRI', generic: 'Sertraline' },
  'FLUOX-20': { code: 'FLUOX-20', name: 'Fluoxetine 20mg capsules', class: 'SSRI', generic: 'Fluoxetine' },

  // Antimetabolites / Immunosuppressants
  'MTX-10': { code: 'MTX-10', name: 'Methotrexate 10mg tablets', class: 'METHOTREXATE', generic: 'Methotrexate' },
};

// High-risk pairwise interactions
export const DDI_RULES = [
  {
    classes: ['ANTICOAGULANT', 'NSAID'],
    severity: 'CRITICAL',
    title: 'Severe Bleeding Hazard',
    message: 'Concurrent use of Warfarin with NSAIDs significantly elevates gastrointestinal and systemic bleeding risks.',
  },
  {
    classes: ['ANTICOAGULANT', 'SALICYLATE_NSAID'],
    severity: 'CRITICAL',
    title: 'Severe Bleeding Hazard',
    message: 'Concurrent use of Warfarin with Aspirin/Salicylates causes major additive antiplatelet/anticoagulant bleeding risk.',
  },
  {
    classes: ['ACE_INHIBITOR', 'POTASSIUM_SPARING_DIURETIC'],
    severity: 'CRITICAL',
    title: 'Severe Hyperkalemia Hazard',
    message: 'Concurrent ACE inhibitor and potassium-sparing diuretic can cause fatal hyperkalemia and cardiac arrhythmias.',
  },
  {
    classes: ['ARB', 'POTASSIUM_SPARING_DIURETIC'],
    severity: 'CRITICAL',
    title: 'Severe Hyperkalemia Hazard',
    message: 'Concurrent ARB and potassium-sparing diuretic can cause fatal hyperkalemia.',
  },
  {
    classes: ['STATIN', 'MACROLIDE'],
    severity: 'CRITICAL',
    title: 'Severe Rhabdomyolysis Hazard',
    message: 'Macrolides inhibit CYP3A4 metabolism of statins, causing marked elevation in plasma levels, severe myopathy, and rhabdomyolysis.',
  },
  {
    classes: ['SSRI', 'OPIOID'],
    severity: 'CRITICAL',
    title: 'Serotonin Syndrome Hazard',
    message: 'Concurrent SSRI antidepressant and Tramadol can precipitate potentially fatal Serotonin Syndrome.',
  },
  {
    classes: ['METHOTREXATE', 'NSAID'],
    severity: 'CRITICAL',
    title: 'Severe Methotrexate Toxicity Hazard',
    message: 'NSAIDs impair renal clearance of Methotrexate, causing life-threatening bone marrow suppression and nephrotoxicity.',
  },
];

// Helper to look up drug metadata
export function resolveDrugInfo(codeOrName) {
  if (!codeOrName) return null;
  const upper = String(codeOrName).toUpperCase().trim();
  if (DRUG_CATALOGUE[upper]) return DRUG_CATALOGUE[upper];

  // Try matching by generic or name
  for (const drug of Object.values(DRUG_CATALOGUE)) {
    if (drug.generic.toUpperCase() === upper || drug.name.toUpperCase().includes(upper)) {
      return drug;
    }
  }

  // Fallback if not in catalogue
  return {
    code: upper,
    name: codeOrName,
    class: 'OTHER',
    generic: codeOrName,
  };
}

/**
 * Checks safety for candidate prescription against active medications and patient allergies.
 *
 * @param {Object} candidate - { medicationCode, medicationName }
 * @param {Array} activeMedications - Array of active meds { medicationCode, medicationName, class }
 * @param {Array} allergies - Array of { substance, severity, reaction }
 * @param {string|null} overrideReason - Clinical justification from doctor
 * @returns {Object} { safe, warnings, requiresOverride, overridden }
 */
export function evaluatePrescriptionSafety(candidate, activeMedications = [], allergies = [], overrideReason = null) {
  const candidateDrug = resolveDrugInfo(candidate.medicationCode || candidate.medicationName);
  const warnings = [];

  // 1. Allergy cross-check
  for (const allergy of allergies) {
    if (!allergy.active) continue;
    const substanceUpper = (allergy.substance || '').toUpperCase();
    const matchesClass = candidateDrug.class === substanceUpper;
    const matchesName = candidateDrug.generic.toUpperCase().includes(substanceUpper)
      || candidateDrug.name.toUpperCase().includes(substanceUpper);

    if (matchesClass || matchesName) {
      warnings.push({
        type: 'ALLERGY_CONTRAINDICATION',
        severity: 'CRITICAL',
        substance: allergy.substance,
        reaction: allergy.reaction,
        message: `Patient has a documented ${allergy.severity} allergy to ${allergy.substance}${allergy.reaction ? ` (Reaction: ${allergy.reaction})` : ''}.`,
      });
    }
  }

  // 2. Duplicate therapy & DDI checks against active medications
  for (const active of activeMedications) {
    const activeDrug = resolveDrugInfo(active.medicationCode || active.medicationName);

    // Duplicate therapy check
    if (activeDrug.code === candidateDrug.code) {
      warnings.push({
        type: 'DUPLICATE_THERAPY',
        severity: 'HIGH',
        existingDrug: activeDrug.name,
        message: `Duplicate therapy: Patient is already actively taking ${activeDrug.name}.`,
      });
    } else if (activeDrug.class !== 'OTHER' && activeDrug.class === candidateDrug.class) {
      warnings.push({
        type: 'DUPLICATE_CLASS',
        severity: 'HIGH',
        existingDrug: activeDrug.name,
        drugClass: activeDrug.class,
        message: `Duplicate therapeutic class: Patient is already prescribed ${activeDrug.name} in the ${activeDrug.class} class.`,
      });
    }

    // Drug-Drug Interaction check
    for (const rule of DDI_RULES) {
      const match1 = rule.classes[0] === candidateDrug.class && rule.classes[1] === activeDrug.class;
      const match2 = rule.classes[1] === candidateDrug.class && rule.classes[0] === activeDrug.class;

      if (match1 || match2) {
        warnings.push({
          type: 'DRUG_DRUG_INTERACTION',
          severity: rule.severity,
          title: rule.title,
          drug1: candidateDrug.name,
          drug2: activeDrug.name,
          message: rule.message,
        });
      }
    }
  }

  const hasCriticalOrHigh = warnings.some((w) => w.severity === 'CRITICAL' || w.severity === 'HIGH');
  const validOverride = typeof overrideReason === 'string' && overrideReason.trim().length >= 5;

  if (hasCriticalOrHigh && !validOverride) {
    return {
      safe: false,
      requiresOverride: true,
      overridden: false,
      warnings,
      candidateDrug,
    };
  }

  return {
    safe: true,
    requiresOverride: hasCriticalOrHigh,
    overridden: hasCriticalOrHigh && validOverride,
    overrideReason: validOverride ? overrideReason.trim() : null,
    warnings,
    candidateDrug,
  };
}

/**
 * Duplicate diagnostic test order checker (DESIGN.md section 7).
 * Checks if the patient has had the same lab test or investigation within recent days.
 */
export async function checkDuplicateTestOrder(patientId, mainResource, { withinDays = 30, db = prisma } = {}) {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

  const existing = await db.clinicalRecord.findFirst({
    where: {
      patientId,
      mainResource,
      createdAt: { gte: since },
      status: { not: 'entered_in_error' },
    },
    include: { facility: true },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return {
      duplicate: true,
      recordId: existing.id,
      createdAt: existing.createdAt,
      facilityName: existing.facility?.name ?? 'Unknown facility',
      warning: `Duplicate test alert: Recent ${mainResource} result found from ${existing.createdAt.toISOString().slice(0, 10)} (${existing.facility?.name ?? 'Facility'}). Repeated testing within ${withinDays} days may be redundant.`,
    };
  }

  return { duplicate: false };
}
