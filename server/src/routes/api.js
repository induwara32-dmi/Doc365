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
  await writeAudit(req.actor, { action: 'patient.view', patientId: patient.id, details: { view: 'full' } });
  res.json({ patient: patient.fhir });
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
