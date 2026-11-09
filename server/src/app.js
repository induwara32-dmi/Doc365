// Builds the Express app (routes and middleware) but does not start it.
// Keeping this separate from server.js lets tests use the app directly.
import express from 'express';
import { prisma } from './db.js';
import { apiRouter } from './routes/api.js';
import { errorHandler, notFound } from './http/error-handler.js';

export const app = express();

app.use(express.json({ limit: '100kb' }));

// CORS middleware for local frontend development (Next.js at localhost:3000)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-patient-pin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Health check: is the server up, and can it reach the database?
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    console.error('Health check: database error:', err.name);
    res.status(503).json({ status: 'ok', db: 'error' });
  }
});

app.use('/api', apiRouter);

app.use(notFound);
app.use(errorHandler);
