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
});

const RecordCorrectBody = z.object({
  bundle: z.record(z.string(), z.any()),
  provenance: z.record(z.string(), z.any()),
  status: z.enum(['amended', 'entered-in-error', 'entered_in_error']).optional(),
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

// Open a patient's full record. Phase 3: role check only (DOCTOR, HOSPITAL_STAFF).
// Phase 4 adds the records, Phase 5 the three keys rule.
api.get('/patients/:healthId', 'record.view_full', async (req, res) => {
  const patient = await findPatient(req.params.healthId);
  const records = await getPatientRecords(patient.id, { actor: req.actor });
  await writeAudit(req.actor, { action: 'patient.view', patientId: patient.id, details: { view: 'full' } });
  res.json({ patient: patient.fhir, records });
});

// ---------- Phase 4: clinical records (signed, append-only) ----------

api.post('/records', 'record.upload', async (req, res) => {
  const { bundle, provenance } = parseBody(RecordUploadBody, req.body);
  const result = await createRecord({ bundle, provenance }, { actor: req.actor });
  res.status(201).json(result);
});

api.post('/records/:id/correct', 'record.correct', async (req, res) => {
  const { bundle, provenance, status } = parseBody(RecordCorrectBody, req.body);
  const result = await correctRecord(req.params.id, { bundle, provenance, status }, { actor: req.actor });
  res.status(201).json(result);
});

api.get('/records/:id', 'record.view', async (req, res) => {
  const result = await getRecordById(req.params.id, { actor: req.actor });
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
  const history = await getRecordHistory(current.lineageId, { actor: req.actor });
  await writeAudit(req.actor, {
    action: 'record.view_history',
    patientId: current.patientId,
    targetType: 'ClinicalRecord',
    targetId: current.lineageId,
  });
  res.json(history);
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
