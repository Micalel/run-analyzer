/**
 * Centralized API client for the Ironmon tracker backend. Every component
 * talks to the server through the functions exported here, never with any fetch calls directly.
 *
 */

const API_BASE_URL = 'http://localhost:3000';

/** Shapes returned by the API 
 * 
 * This is necessary because the backend is considered a separate project (don't forget we are using two separate package.json)
 * so we can't use reuse the backend's types constructed with Prisma.
 * This is basically a simplified copy of what we obtained when we did curl test in the backend,
 * 
*/


export interface Run {
  id: string;
  seed: string;
  randomizerVersion: string;
  gameName: string | null;
  starterSpecies: string | null;
  status: 'ACTIVE' | 'ENDED';
  startedAt: string;
  endedAt: string | null;
  causeOfEnd: string | null;
}

/** How a species was first encountered set once, never changed after. */
export type EncounterContext = 'WILD' | 'TRAINER' | 'STATIC' | 'TRADE';
 
export interface Encounter {
  id: string;
  runId: string;
  species: string;
  knownMoves: string[];
  context: EncounterContext | null;
  firstSeenAt: string;
  lastSeenAt: string;
}
export interface InventoryItem {
  id: string;
  runId: string;
  itemName: string;
  quantity: number;
  obtainedAt: string;
}

/** What GET /runs/:id returns: a Run plus its live-safe related data. */
export interface RunDetail extends Run {
  encounters: Encounter[];
  inventoryItems: InventoryItem[];
}


/**
 * What GET /runs (the list) returns: a Run plus just enough to know
 * whether its archive still exists ,`archive` is `null` once it's been
 * deleted, or `{ id }` (never the actual archived data. The list route
 * never loads that) while it's still there. Kept as its own type rather
 * than added to `Run` itself: `Run` is also the shape returned by
 * createRun/endRun, where no archive info is ever included, so adding it
 * to the base type would claim something isn't actually true everywhere.
 */
export interface RunListItem extends Run {
  archive: { id: string } | null;
}

/**
 * 
 * What GET /runs/:id/archive returns. `data` matches the shape of
 * `ParsedRandomizerLog` from the backend's randomizer-log-schema.ts, but
 * it's left as `unknown` here rather than fully retyped, narrow it with a
 * type assertion where you actually read specific fields from it.
 * 
 */
export interface RunArchive {
  id: string;
  runId: string;
  data: unknown;
  createdAt: string;
}

// Shared request helper 

/**
 * 
 * Wraps `fetch` with the two things every call needs: throwing on
 * non-2xx responses, and handling the fact that a 204 No Content response (used by
 * deleteArchive) has no body to parse.
 * 
 * I am throwing on non-2xx responses here rather than returning a `Result` type because fetch() considers 4xx and 5xx responses to be successful,
 * so if we don't throw here then the caller will have to check `response.ok` themselves, which is error-prone and repetitive.
 * 
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// One function per endpoint 

export function createRun(logText: string, gameName?: string): Promise<Run> {
  return request<Run>('/runs', {
    method: 'POST',
    body: JSON.stringify({ logText, gameName }),
  });
}

export function addEncounter(runId: string, species: string, move?: string, context?: EncounterContext): Promise<Encounter> {
  return request<Encounter>(`/runs/${runId}/encounters`, {
    method: 'POST',
    body: JSON.stringify({ species, move, context }),
  });
}

export function addItem(
  runId: string,
  itemName: string,
  quantity?: number,
): Promise<InventoryItem> {
  return request<InventoryItem>(`/runs/${runId}/items`, {
    method: 'POST',
    body: JSON.stringify({ itemName, quantity }),
  });
}

export function endRun(runId: string, causeOfEnd?: string): Promise<Run> {
  return request<Run>(`/runs/${runId}/end`, {
    method: 'POST',
    body: JSON.stringify({ causeOfEnd }),
  });
}

export function getRuns(): Promise<RunListItem[]> {
  return request<RunListItem[]>('/runs');
}

export function getRun(runId: string): Promise<RunDetail> {
  return request<RunDetail>(`/runs/${runId}`);
}

export function getArchive(runId: string): Promise<RunArchive> {
  return request<RunArchive>(`/runs/${runId}/archive`);
}

export function deleteArchive(runId: string): Promise<void> {
  return request<void>(`/runs/${runId}/archive`, { method: 'DELETE' });
}