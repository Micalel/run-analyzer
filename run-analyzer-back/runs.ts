/**
 * Routes for creating and managing Ironmon runs.
 *
 * Mounted at /runs in server.ts, so every path declared here is relative to
 * that prefix (the route below registered as "/" is actually POST /runs
 * once mounted).
 */
import { Router } from 'express';
import type { Prisma } from './generated/prisma/client.ts';
import { prisma } from './db.ts';
import { parseRandomizerLogFromText } from './randomizer-log-parser.ts';

export const runsRouter = Router();

/**
 * POST /runs
 * Starts tracking a new Ironmon attempt from the content of a randomizer
 * log file. Takes the raw text itself rather than a file path: a browser
 * can never expose the absolute path of a file the player picked through
 * a file input (blocked for security reasons), only its content, so the
 * frontend reads the picked file client-side and sends its text here.
 *
 * Body: { logText: string, gameName?: string }
 * Returns: the created Run (lightweight, the response never includes the
 * archive's contents, even though it's stored right away, see below).
 */
runsRouter.post('/', async (req, res) => {
  const { logText, gameName } = req.body ?? {};
 
  if (typeof logText !== 'string' || logText.trim() === '') {
    res.status(400).json({ error: 'logText (string) is required' });
    return;
  }
 
  let parsed;
  try {
    parsed = parseRandomizerLogFromText(logText);
  } catch (error) {
    res.status(400).json({ error: `Could not parse log file: ${(error as Error).message}` });
    return;
  }

  // Note: `starterSpecies` is deliberately left unset here. The log tells us
  // which 3 species occupy the starter slots, but not which one the player
  // actually picks in-game. That's a real choice, it gets filled in later (e.g. once the manual/live tracking
  // records the player's actual starter as their first Encounter).

  const run = await prisma.run.create({
    data: {
      seed: parsed.meta.seed,
      randomizerVersion: parsed.meta.randomizerVersion,
      gameName: gameName ?? null,
      // Nested write: creates the Run and its RunArchive row together, in
      // the same database transaction — either both are created, or
      // neither is (no risk of ending up with a Run that has no archive
      // because of a crash in between two separate writes).
      archive: {
        create: {
          // Prisma's `Json` field just wants a plain JSON-serializable
          // value. `parsed` already is one — it's exactly what
          // `parseRandomizerLog` returns — so it's passed through as-is.
          data: parsed as unknown as Prisma.InputJsonValue,
        },
      },
    },
  });

  res.status(201).json(run);
});

/**
 * Prisma's known-error type for things like "foreign key constraint
 * failed" (a runId that doesn't correspond to any real Run). Checking
 * `error.code` against this lets us return a clean 404 instead of a raw
 * 500 for what's really just bad input, not a server bug.
 */
function isPrismaKnownError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * 
 * For any developer looking at this code and thinking "you are just duplicating values":
 * 
 * Runtime validation for the `context` field on incoming request bodies.
 * `req.body` is untyped (`any`), so nothing stops a client from sending a
 * junk string here. Without this check it would either sail through
 * TypeScript and hit Postgres's enum constraint at insert time (raw 500),
 * or silently get stored as an unexpected value.
 *
 * The 4 values are duplicated here rather than imported from Prisma's
 * generated `EncounterContext` enum, to stay independent of the generated
 * client's exact output shape (which has changed across Prisma versions v6 and v7).
 * The `as const` + `[number]` pattern below derives a string-literal union
 * type from this array so the values only need to be listed once for
 * both the type and the runtime check to use.
 *
 * `isValidEncounterContext` is a type predicate (`value is X` return
 * type): when it returns true, TypeScript narrows the checked value to
 * `EncounterContextInput` wherever the check was used, without a manual
 * cast. The `as readonly string[]` cast on the array is needed because
 * `.includes()` on a literal-typed tuple normally only accepts those
 * exact literals as an argument . Casting widens it so an arbitrary
 * `string` (which is all we have before the check passes) can be tested
 * against it.
 * 
 */


const VALID_ENCOUNTER_CONTEXTS = ['WILD', 'TRAINER', 'STATIC', 'TRADE'] as const;
type EncounterContextInput = (typeof VALID_ENCOUNTER_CONTEXTS)[number];
 
function isValidEncounterContext(value: unknown): value is EncounterContextInput {
  return (
    typeof value === 'string' &&
    (VALID_ENCOUNTER_CONTEXTS as readonly string[]).includes(value)
  );
}

/**
 * POST /runs/:id/encounters
 * Records that the player has actually seen a species during this run,
 * the "live, non-spoiler" data described in the schema. Safe to expose
 * while the run is still active, since it only ever reflects what's been
 * observed in-game so far.
 *
 * Body: { species: string, move?: string, context?: 'WILD' | 'TRAINER' | 'STATIC' | 'TRADE' }
 *   First time this species is reported for this run: creates a new
 *   Encounter, recording `context` if it was given.
 *   Already reported before: adds `move` to its known moves (only if it's
 *   not already there — no duplicates) and bumps `lastSeenAt`. `context`
 *   is ignored on this path, check the schema comment on why it's set once
 *   and never overwritten.
 */
runsRouter.post('/:id/encounters', async (req, res) => {
  const runId = req.params.id;
  const { species, move, context } = req.body ?? {};
 
  if (typeof species !== 'string' || species.trim() === '') {
    res.status(400).json({ error: 'species (string) is required' });
    return;
  }
 
  if (context !== undefined && !isValidEncounterContext(context)) {
    res.status(400).json({
      error: `context must be one of: ${VALID_ENCOUNTER_CONTEXTS.join(', ')}`,
    });
    return;
  }
 
  try {
    // `runId_species` is the name Prisma auto-generates for the compound
    // unique constraint declared as `@@unique([runId, species])` in the
    // schema. It targets "the encounter for this exact runId+species
    // pair" in a `where` clause.
    const existing = await prisma.encounter.findUnique({
      where: { runId_species: { runId, species } },
    });
 
    if (!existing) {
      const encounter = await prisma.encounter.create({
        data: {
          runId,
          species,
          knownMoves: typeof move === 'string' && move.trim() !== '' ? [move] : [],
          context: isValidEncounterContext(context) ? context : null,
        },
      });
      res.status(201).json(encounter);
      return;
    }
 
    // Merge in JS rather than relying on Prisma's `push` for the array
    // update: `push` would happily add the same move twice if it's
    // reported again later, and duplicates aren't wanted here.
    const knownMoves = existing.knownMoves as string[];
    const updatedMoves =
      typeof move === 'string' && move.trim() !== '' && !knownMoves.includes(move)
        ? [...knownMoves, move]
        : knownMoves;
 
    const encounter = await prisma.encounter.update({
      where: { id: existing.id },
      data: { knownMoves: updatedMoves, lastSeenAt: new Date() },
    });
    res.json(encounter);
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === 'P2003') {
      res.status(404).json({ error: `No run found with id "${runId}"` });
      return;
    }
    throw error;
  }
});

/**
 * POST /runs/:id/items
 * Records an item the player actually picked up during this run — same
 * "observed only" principle as encounters. Unlike Encounter, there's no
 * uniqueness constraint on itemName (objects can be found multiple times at different locations).
 *
 * Body: { itemName: string, quantity?: number }
 */

runsRouter.post('/:id/items', async (req, res) => {
  const runId = req.params.id;
  const { itemName, quantity } = req.body ?? {};
 
  if (typeof itemName !== 'string' || itemName.trim() === '') {
    res.status(400).json({ error: 'itemName (string) is required' });
    return;
  }
 
  try {
    const item = await prisma.inventoryItem.create({
      data: {
        runId,
        itemName,
        quantity: typeof quantity === 'number' && quantity > 0 ? quantity : 1,
      },
    });
    res.status(201).json(item);
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === 'P2003') {
      res.status(404).json({ error: `No run found with id "${runId}"` });
      return;
    }
    throw error;
  }
});

/**
 * POST /runs/:id/end
 * Marks a run as finished. This doesn't create anything new, the archive
 * was already stored back in POST /runs, it just flips the switch that
 * unlocks access to it (check /:id/archive)
 *
 * Body: { causeOfEnd?: string }
 */
runsRouter.post('/:id/end', async (req, res) => {
  const runId = req.params.id;
  const { causeOfEnd } = req.body ?? {};
 
  try {
    const run = await prisma.run.update({
      where: { id: runId },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
        causeOfEnd: typeof causeOfEnd === 'string' ? causeOfEnd : null,
      },
    });
    res.json(run);
  } catch (error) {

    // P2025: Prisma's "record to update not found", different from the
    // P2003 used elsewhere (that one's for foreign key violations on
    // create; this one's specifically for updating something that isn't
    // there at all).

    if (isPrismaKnownError(error) && error.code === 'P2025') {
      res.status(404).json({ error: `No run found with id "${runId}"` });
      return;
    }
    throw error;
  }
});

/**
 * GET /runs
 * Lightweight history list: Run fields only, no encounters, items, or
 * archive. This is what the past attempts list in the UI will go through.
 */
runsRouter.get('/', async (_req, res) => {
  const runs = await prisma.run.findMany({
    orderBy: { startedAt: 'desc' },
    include: { archive: { select: { id: true } } },
  }); 
  res.json(runs);
});

/**
 * 
 * GET /runs/:id
 * A single run's live-safe detail view: the Run itself plus everything
 * actually observed in-game (encounters, items). Does not include the
 * archive relation so there's no risk of it leaking here by accident.
 * 
 */
runsRouter.get('/:id', async (req, res) => {
  const runId = req.params.id;
 
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { encounters: true, inventoryItems: true },
  });
 
  if (!run) {
    res.status(404).json({ error: `No run found with id "${runId}"` });
    return;
  }
 
  res.json(run);
});


/**
 * 
 * GET /runs/:id/archive
 * The one place the full "rulebreaking" data can be read, and only
 * once the run has actually ended. This is the concrete route 
 * that keeps the archive but doesn't allow it to be read until the run
 * is finished. That's where the status check !==ENDEND comes into play.
 * 
 */
runsRouter.get('/:id/archive', async (req, res) => {
  const runId = req.params.id;
 
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { archive: true },
  });
 
  if (!run) {
    res.status(404).json({ error: `No run found with id "${runId}"` });
    return;
  }
 
  if (run.status !== 'ENDED') {
    res.status(403).json({ error: 'Archive is only available once the run has ended' });
    return;
  }
 
  if (!run.archive) {
    res.status(404).json({ error: 'This run has no archive (it may have been deleted)' });
    return;
  }
 
  res.json(run.archive);
});

/**
 * 
 * DELETE /runs/:id/archive
 * Deletes only the RunArchive row. The Run itself, and its stats
 * (encounters, items, dates), are untouched. This is exactly the "throw
 * away the spoilers, it only keeps the lightweight data if the archives
 * start to take up too much space or becomes too bothersome to keep a good
 * UI experience.
 * 
 */
runsRouter.delete('/:id/archive', async (req, res) => {
  const runId = req.params.id;
 
  try {
    await prisma.runArchive.delete({ where: { runId } });
    // 204 No Content: successful, nothing meaningful to send back.
    res.status(204).send();
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === 'P2025') {
      res.status(404).json({ error: `No archive found for run "${runId}"` });
      return;
    }
    throw error;
  }
});