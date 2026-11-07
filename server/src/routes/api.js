// The Doc365 API. Every route names its permission (default deny, see
// src/http/secure-router.js). Every request that touches patient data is audited.
import { z } from 'zod';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { secureRouter } from '../http/secure-router.js';
import { parseBody } from '../http/validate.js';
import { writeAudit } from '../audit/audit-log.js';
import { login } from '../auth/login-service.js';
import { publicSession } from '../auth/session.js';
import { blockCard, replaceCard, cardQrPayload } from '../patients/card-service.js';
import {
  createRecord,
  correctRecord,
  getRecordById,
  getRecordHistory,
  getPatientRecords,
} from '../records/record-service.js';
import {
  scanCardAndCreateGrant,
  breakGlassAccess,
  getEmergencySummary,
  setPatientPin,
  blockProvider,
  unblockProvider,
  hideRecord,
  unhideRecord,
  optOutPatient,
  optInPatient,
  getAccessLedger,
} from '../access/access-service.js';

const api = secureRouter();

const LoginBody = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  membershipId: z.uuid().optional(),
  asPatient: z.boolean().optional(),
});

const ReasonBody = z.object({ reason: z.string().trim().min(3).max(500) });

const ReplaceBody = z.object({
  oldStatus: z.enum(['BLOCKED', 'REPLACED']),
  reason: z.string().trim().min(3).max(500),
});

const RecordUploadBody = z.object({
  bundle: z.record(z.string(), z.any()),
  provenance: z.record(z.string(), z.any()).nullable().optional(),
  isSensitive: z.boolean().optional(),
});

const RecordCorrectBody = z.object({
  bundle: z.record(z.string(), z.any()),
  provenance: z.record(z.string(), z.any()),
  status: z.enum(['amended', 'entered-in-error', 'entered_in_error']).optional(),
  isSensitive: z.boolean().optional(),
});

const ScanCardBody = z.object({
  healthId: z.string().trim().min(5),
  cardSerial: z.string().trim().min(5),
});

const BreakGlassBody = z.object({
  healthId: z.string().trim().min(5),
  reason: z.string().trim().min(1).max(1000),
});

const SetPinBody = z.object({
  pin: z.string().trim().regex(/^\d{4,6}$/),
});

const BlockProviderBody = z.object({
  facilityId: z.string().uuid().optional(),
  doctorUserId: z.string().uuid().optional(),
  reason: z.string().trim().max(500).optional(),
});

const HideRecordBody = z.object({
  lineageId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

const UnhideRecordBody = z.object({
  lineageId: z.string().uuid(),
});

const OptOutBody = z.object({
  reason: z.string().trim().max(500).optional(),
});

async function findPatient(healthId) {
  const patient = await prisma.patient.findUnique({ where: { healthId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'No patient with this Health ID');
  return patient;
}

api.post('/auth/login', 'auth.login', async (req, res) => {
  res.json(await login(parseBody(LoginBody, req.body)));
});

api.get('/me', 'session.view_self', (req, res) => {
  res.json({ session: publicSession(req.actor) });
});

// Open a patient's full record. Requires active AccessGrant (Three Keys) for clinical staff.
api.get('/patients/:healthId', 'record.view_full', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const pin = req.get('x-patient-pin') ?? req.query.pin;
  const records = await getPatientRecords(patient.id, { actor: req.actor, pin });
  await writeAudit(req.actor, { action: 'patient.view', patientId: patient.id, details: { view: 'full' } });
  res.json({ patient: patient.fhir, records });
});

// Patient views their own (or guardian views child's) full health record.
api.get('/patients/:healthId/records', 'record.view_own', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const records = await getPatientRecords(patient.id, { actor: req.actor });
  await writeAudit(req.actor, { action: 'patient.view_own', patientId: patient.id });
  res.json({ patient: patient.fhir, records });
});

// ---------- Phase 4: clinical records (signed, append-only) ----------

api.post('/records', 'record.upload', async (req, res) => {
  const { bundle, provenance, isSensitive } = parseBody(RecordUploadBody, req.body);
  const result = await createRecord({ bundle, provenance, isSensitive }, { actor: req.actor });
  res.status(201).json(result);
});

api.post('/records/:id/correct', 'record.correct', async (req, res) => {
  const { bundle, provenance, status, isSensitive } = parseBody(RecordCorrectBody, req.body);
  const result = await correctRecord(req.params.id, { bundle, provenance, status, isSensitive }, { actor: req.actor });
  res.status(201).json(result);
});

api.get('/records/:id', 'record.view', async (req, res) => {
  const pin = req.get('x-patient-pin') ?? req.query.pin;
  const result = await getRecordById(req.params.id, { actor: req.actor, pin });
  await writeAudit(req.actor, {
    action: 'record.view',
    patientId: result.record.patientId,
    targetType: 'ClinicalRecord',
    targetId: result.record.id,
  });
  res.json(result);
});

api.get('/records/:id/history', 'record.view', async (req, res) => {
  const current = await prisma.clinicalRecord.findUnique({ where: { id: req.params.id } });
  if (!current) throw new AppError('RECORD_NOT_FOUND', 'Record not found');
  const pin = req.get('x-patient-pin') ?? req.query.pin;
  const history = await getRecordHistory(current.lineageId, { actor: req.actor, pin });
  await writeAudit(req.actor, {
    action: 'record.view_history',
    patientId: current.patientId,
    targetType: 'ClinicalRecord',
    targetId: current.lineageId,
  });
  res.json(history);
});

// ---------- Phase 5: Access Engine and Consent Controls ----------

// 1. Three Keys card scan (creates 90-day AccessGrant)
api.post('/access/scan', 'access.scan', async (req, res) => {
  const { healthId, cardSerial } = parseBody(ScanCardBody, req.body);
  const result = await scanCardAndCreateGrant({ healthId, cardSerial }, { actor: req.actor });
  res.status(201).json(result);
});

// 2. Emergency Break-Glass override
api.post('/access/break-glass', 'access.break_glass', async (req, res) => {
  const { healthId, reason } = parseBody(BreakGlassBody, req.body);
  const result = await breakGlassAccess(healthId, { reason }, { actor: req.actor });
  res.status(201).json(result);
});

// 3. Emergency summary (cardless access)
api.get('/patients/:healthId/emergency', 'access.emergency_summary', async (req, res) => {
  const result = await getEmergencySummary(req.params.healthId, { actor: req.actor });
  res.json(result);
});

// 4. Set confidential patient PIN (for sensitive records)
api.post('/patients/:healthId/pin', 'patient.set_pin', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const { pin } = parseBody(SetPinBody, req.body);
  const result = await setPatientPin(patient.id, pin, { actor: req.actor });
  res.json(result);
});

// 5. Provider blocking & unblocking
api.post('/patients/:healthId/blocks', 'patient.consent_manage', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const { facilityId, doctorUserId, reason } = parseBody(BlockProviderBody, req.body);
  const block = await blockProvider(patient.id, { facilityId, doctorUserId, reason }, { actor: req.actor });
  res.status(201).json({ block });
});

api.post('/patients/:healthId/blocks/:blockId/unblock', 'patient.consent_manage', async (req, res) => {
  const block = await unblockProvider(req.params.blockId, { actor: req.actor });
  res.json({ block });
});

// 6. Document hiding & unhiding
api.post('/patients/:healthId/hide', 'patient.consent_manage', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const { lineageId, reason } = parseBody(HideRecordBody, req.body);
  const hiddenRecord = await hideRecord(patient.id, lineageId, { reason, actor: req.actor });
  res.status(201).json({ hiddenRecord });
});

api.post('/patients/:healthId/unhide', 'patient.consent_manage', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const { lineageId } = parseBody(UnhideRecordBody, req.body);
  const result = await unhideRecord(patient.id, lineageId, { actor: req.actor });
  res.json(result);
});

// 7. Patient opt-out & opt-in
api.post('/patients/:healthId/opt-out', 'patient.consent_manage', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const { reason } = parseBody(OptOutBody, req.body);
  const result = await optOutPatient(patient.id, { reason, actor: req.actor });
  res.json({ optedOut: Boolean(result.optedOutAt) });
});

api.post('/patients/:healthId/opt-in', 'patient.consent_manage', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const result = await optInPatient(patient.id, { actor: req.actor });
  res.json({ optedOut: Boolean(result.optedOutAt) });
});

// 8. "Who viewed my record" access ledger
api.get('/patients/:healthId/access-ledger', 'access.view_ledger', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const result = await getAccessLedger(patient.id, { actor: req.actor });
  res.json(result);
});

api.post('/cards/:serial/block', 'card.block', async (req, res) => {
  const { reason } = parseBody(ReasonBody, req.body);
  const card = await blockCard(req.params.serial, reason, req.actor);
  res.json({ card: { serial: card.serial, status: card.status } });
});

api.post('/patients/:healthId/cards/replace', 'card.replace', async (req, res) => {
  const { oldStatus, reason } = parseBody(ReplaceBody, req.body);
  const patient = await findPatient(req.params.healthId);
  const card = await replaceCard(patient.id, { oldStatus, reason, actor: req.actor });
  res.json({ card: { serial: card.serial, status: card.status }, qrPayload: cardQrPayload(patient.healthId, card.serial) });
});

export const apiRouter = api.router;
