/**
 * Quick sanity check, bypassing Prisma Studio entirely (which seems to
 * choke on rendering a very large JSON column): confirms the most recently
 * created RunArchive actually contains real data, and reports its size so
 * we know whether "huge JSON blob" really is the cause of the Studio error.
 *
 * Run with:
 *   node --experimental-strip-types check-archive.ts
 */
import { prisma } from './db.ts';
 
const archive = await prisma.runArchive.findFirst({
  orderBy: { createdAt: 'desc' },
});
 
if (!archive) {
  console.log('No RunArchive found — the archive was never created.');
} else {
  const serialized = JSON.stringify(archive.data);
  const topLevelKeys = Object.keys(archive.data as Record<string, unknown>);
 
  console.log('RunArchive found for runId:', archive.runId);
  console.log('Serialized size:', (serialized.length / 1024).toFixed(1), 'KB');
  console.log('Top-level keys:', topLevelKeys);
}
 
await prisma.$disconnect();