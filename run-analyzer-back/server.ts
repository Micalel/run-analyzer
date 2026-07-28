/**
 * Express entry point for the Ironmon tracker API.
 *
 * Run it with:
 *   node --experimental-strip-types server.ts
 * (or `npm run dev`, defined in package.json)
 *
 * This file only sets up the server itself and a health check for now.
 * The actual run/encounter/item/archive routes get added on top of this
 * in the next steps, once this base is confirmed working.
 */
import express from 'express';
import cors from 'cors';
import { prisma } from './db.ts';
import { runsRouter } from './runs.ts';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;


app.use(cors({ origin: 'http://localhost:5173' })); // Allow requests from the frontend dev server
// Parses incoming JSON request bodies into `req.body`.
app.use(express.json({ limit: '10mb' }));
app.use('/runs', runsRouter);

/**
 * Health check: confirms two things at once, that the server process is
 * actually running, AND that it can reach the database (not just that
 * `node server.ts` didn't crash on startup).
 */
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'error', database: 'unreachable' });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});