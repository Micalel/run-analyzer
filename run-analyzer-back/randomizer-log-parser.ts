/**
 * Parser for Universal Pokemon Randomizer log files.
 *
 * How to run it?
 *
 *  node --experimental-strip-types randomizer-log-parser.ts <path-to-log> [output.json]
 *
 * Few recommandations: 1. If it's not obvious enough, it is for testing purposes only.
 *                      2. If you want to avoid unnecessary errors, make sure the log file is not empty and is a valid log file and everything is in the same file.
 *
 * The file will be organized into sections and parsed as the log file is structured.
 */


import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  ParsedRandomizerLog,
  RandomizerLogMeta,
  EvolutionChange,
  HeldItem,
  PokemonBaseStats,
  StarterAssignment,
  TrainerEntry,
  StaticEncounter,
  WildEncounterEntry,
  WildEncounterSet,
  InGameTrade,
  PickupItemTier,
  PickupLevelBracket,
  PokemonMoveset,
  LevelUpMove,
  TmMoveEntry,
  TmHmCompatibility,
} from './randomizer-log-schema.ts';

/**
 * From here, I'll explain every step so you can understand and recreate this for the version you want to adapt.
 * (If the logs structure ever change)
 */



// STEP 0 — Read the log and split it into sections and blocks


/**
 * Cleans up raw log text and splits it into lines, already cleaned up:
 *  - the UTF-8 BOM is stripped (if not, the version line will never match)
 *  - Windows line endings (\r\n) are normalized to \n, it is done to normalize endings and avoid issues.
 *
 * Kept separate from reading the file off disk (below), so the exact same
 * cleanup can run on text that came from somewhere else too — e.g. the
 * content of a file picked in a browser and sent to the API as a string,
 * where there's no local file path to read in the first place.
 *
 * @param text - The raw file content, exactly as read/received.
 * @returns The content split into an array of lines (no line-ending characters, no BOM).
 */
function splitTextIntoLines(text: string): string[] {
  const withoutBom = text.replace(/^﻿/, '');
  const normalized = withoutBom.replace(/\r\n/g, '\n');
  return normalized.split('\n');
}

// ------
// STEP 1 — Header block (version, seed, settings string, status lines)
// ------
//
// (numbered "STEP 0" and "STEP 1" both live before any "--Section--" split
// on purpose — these header lines sit above the first section marker in
// the file, so they need `allLines` directly rather than a sliced section)

/**
 * The log file is one long list of lines, broken into named sections by header
 * lines that look like "--Section Title--". This scans once, finds every
 * header, and slices the lines in between into a Map keyed by section title.
 * Everything downstream just asks "give me the lines for X" instead of line numbers.
 * This will make errors less likekely if the file structure ever changes.
 * ATTENTION: If the sections headlines ever change, this will break, so make sure to check the headlines if you want to adapt this to a new version of the randomizer.
 *
 * @param lines - All lines of the log file, as returned by `splitTextIntoLines`.
 * @returns A Map from section title (e.g. "Randomized Evolutions") to the
 *          lines belonging to that section (the header line itself excluded).
 */
function splitIntoSections(lines: string[]): Map<string, string[]> {
  const headerPattern = /^--(.+)--$/;
  const headers: { title: string; index: number }[] = []; // This is initialisation, headers will have an header and an index, it will be stored into an array and it's initialized as an empty array, it will be filled with the headers found in the log file.

  lines.forEach((line, index) => {
    const match = headerPattern.exec(line.trim());
    if (match) headers.push({ title: match[1].trim(), index });
  }); // This will loop through all the lines and find the headers, it will store the header and the index of the header into the headers array. Thanks to the .exec(line.trim()) function, it will find the header even if there is a space before or after the header, it will trim the line and find the header.

  const sections = new Map<string, string[]>();
  headers.forEach((header, i) => { // So to be clear, i is the index of the header IN THE HEADER ARRAY. Not the index of the header in the log file. The index of the header in the log file is stored in the header.index property.
    const start = header.index + 1; // Title line 5, reads the randomized content on the line 6 basically.
    const end = i + 1 < headers.length ? headers[i + 1].index : lines.length; // If there is a next header, the end is the index of the next header, otherwise it is the end of the file.
    sections.set(header.title, lines.slice(start, end)); // This is the slicing part, it will slice the lines between the start and end index and store it into the sections map with the header title as the key. (check your output, you will understand)
  });

  return sections;
}


/**
 * The randomizer log file is structured into sections, and each section is structured into block.
 * But, they are not explicitly marked, they're just separated by empty lines.
 * So this function will split the lines into blocks, each block is an array of lines, and the blocks are separated by empty lines.
 *
 * @param lines - The lines of a single section (e.g. everything under
 *                "--Pokemon Movesets--"), possibly containing several
 *                records separated by blank lines.
 * @returns One array of lines per record, in the same order as the input,
 *          with the blank separator lines removed.
 *
 */
function splitIntoBlocks(lines: string[]): string[][] {
  const blocks: string[][] = []; // It can be confusing, read this as "blocks is an array of arrays of strings, and it is initialized as an empty array". Each block will be an array of lines, and the blocks will be stored in the blocks array." (thanks ChatGPT to help me formulate this sentence, it was confusing to write it in a way that is understandable)
  let current: string[] = []; // This stores the lines of the current block before it is pushed into the blocks array and reset.


  /** Another comment on how the loop works for those unfamiliar with it and an example:
   * Our scope: ["001 BULBIZARRE -> ...", "HP 51", "", "002 HERBIZARRE -> ...", "HP 87"]
   * Line: "001 BULBIZARRE -> ..."
   * line.trim() === false, nothing to do, there's no space before or after the line, so we can just check if the line is empty or not.
   * Since it's false, we can just skip up to current.push(line), which will push the line into the current block.
   *
   * line = "HP 51"
   * line.trim() === false, nothing to do, we can just skip up to current.push(line), which will push the line into the current block.
   *
   * line = ""
   * line.trim() === true, so we check if current.length > 0 (that contains ["001 BULBIZARRE -> ...", "HP 51"]), which is true, so we push current into blocks, and reset current to an empty array.
   *
   * We jump the current.push(line) because the line is empty, we don't want to push an empty line into the current block.
   *
   * And it does the same from here because we will have pushed the current block into blocks, and reset current to an empty array, so we can start a new block with the next lines.
   */
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);

  return blocks;
}

// --------
// STEP 1 — Header block (version, seed, settings string, status lines)
// --------

/**
 * Parses the log's header lines ("Randomizer Version: ...", "Random Seed: ...",
 * "Settings String: ..."), which appear before any "--Section--" marker.
 *
 * @param allLines - Every line of the log file (searched directly rather
 *                    than sliced, since these lines can be found by their
 *                    "key:" prefix regardless of where they sit in the file).
 * @returns The parsed version, seed and settings string. `moveDataStatus`
 *          and `moveTutorStatus` are added separately by the caller via
 *          `findStatusLine`, not by this function.
 * @throws If any of the three expected header lines is missing.
 */
function parseMeta(allLines: string[]): RandomizerLogMeta {

  // This helper function finds a line that starts with the given key (e.g. "Randomizer Version:") and returns the value after the colon, trimmed of whitespace. If the line is not found, it throws an error.
  // For any developer reading this, yes it's inefficient, but the logs files are small and this is a one-time parse, so it doesn't matter. If you want to optimize it, you can do it, but I'm too lazy to do it for the improvement we'll get.
  const get = (key: string): string => {
    const line = allLines.find((l) => l.startsWith(`${key}:`));
    if (!line) throw new Error(`Missing header line for "${key}"`);
    return line.slice(key.length + 1).trim();
  };

  return {
    randomizerVersion: get('Randomizer Version'),
    seed: get('Random Seed'),
    settingsString: get('Settings String'),
  };
}

/**
 * "Move Data: Unchanged." and "Move Tutor Moves: Unchanged." are scattered
 * around the log file, not in a single block, and not at a fixed line number.
 * Instead of hunting for them at a specific line number (fragile if the log
 * format shifts slightly), we scan every line once for a given label.
 *
 * @param allLines - Every line of the log file.
 * @param label - The status line's label to look for, e.g. "Move Data"
 *                (matched against a line starting with "Move Data:").
 * @returns The value after the label, with the trailing period removed, or
 *          `undefined` if no line with that label exists in the file.
 */
function findStatusLine(allLines: string[], label: string): string | undefined {
  const line = allLines.find((l) => l.trim().startsWith(`${label}:`));
  if (!line) return undefined;
  return line.trim().slice(label.length + 1).trim().replace(/\.$/, '');
}

// ------
// STEP 2 — Randomized Evolutions
// ------


/**
 * Parses the --Randomized Evolutions-- section.
 * Examples will be added to each line to show what it does, or you can check the log file to see figure it out.
 *
 * @param lines - The lines of the "Randomized Evolutions" section.
 * @returns One entry per evolution line, with `to` always an array even,
 *          for non-branching evolutions, so branching ones (e.g. EEVEE,
 *          which evolves into several species) are handled the same way as
 *          everything else, normalizing the data structure for easier use later.
 */
function parseEvolutions(lines: string[]): EvolutionChange[] {
  return lines // this will be our line: "ORTIDE           -> PHYLLALI and SEVIPER",
    .filter((l) => l.trim() !== '') // Thinks of these as throwing out all the empty lines, we don't want to parse empty lines, so we filter them out.
    .map((line) => {
      const [from, toRaw] = line.split('->').map((part) => part.trim()); // Our line becomes ["ORTIDE", "PHYLLALI and SEVIPER"], we split the line into two parts, the first part is the original species, the second part is the randomized species, and we trim both parts to remove any extra spaces.
        const to = toRaw
        .replace(/ and /g, ', ') // The log likes to use "and" to separate multiple evolutions, so we normalize. ["PHYLLALI", " SEVIPER"]
        .split(',') // Split them ["PHYLLALI", " SEVIPER"]
        .map((s) => s.trim()) // Trim them ["PHYLLALI", "SEVIPER"]
        .filter(Boolean);
      return { from, to }; // Then we return them as an object { from: "ORTIDE", to: ["PHYLLALI", "SEVIPER"] }
    });
}

// ======
// STEP 3 — Pokémon Base Stats & Types
// ======


/**
 * Parses the "held item" column of a --Pokemon Base Stats & Types-- row.
 *
 * @param raw - The raw item column text, e.g. "Calcium (common), CD Douteux (rare)",
 *              "Baie Pommo (100%)", "-", or an empty string.
 * @returns The list of possible held items with their drop-rate label. An
 *          empty array if the species can't hold any item in this seed.
 */
function parseHeldItems(raw: string): HeldItem[] {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return []; // If the item column is empty or "-", it means the species can't hold any item, so we return an empty array.

  // Thank the logs for this chunk of code. So this basically allows for, for example, "Baie Pommo (100%)" to be parsed into a name and a rating. It will have the same effect on other objects too that have tendancies to name their items with some sort of rating.
  return trimmed.split(',').map((chunk) => {
    const match = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(chunk.trim()); // This is regex, too long to explain here, but it basically captures the name and the rating of the item, and ignores any extra spaces before or after the name and rating. It will also ignore any extra spaces before or after the whole chunk.

    if (!match) return { name: chunk.trim(), rateLabel: 'unknown' }; // I don't want crashes, so if the regex doesn't match, we return the whole chunk as the name and "unknown" as the rating. This is a fallback for any unexpected format.

    return { name: match[1].trim(), rateLabel: match[2].trim() };
  });
}



/**
 * Parses the --Pokemon Base Stats & Types-- section.
 *
 * @param lines - The lines of the "Pokemon Base Stats & Types" section,
 *                including the "NUM|NAME|TYPE|..." column header row (which
 *                this function filters out itself).
 * @returns One entry per species, with its types split into an array and
 *          its held items parsed via `parseHeldItems`.
 */
function parseBaseStats(lines: string[]): PokemonBaseStats[] {

  return lines
    .filter((l) => l.includes('|') && !l.trim().startsWith('NUM'))
    .map((line) => {
      const cols = line.split('|').map((c) => c.trim());
      const [num, name, types, hp, atk, def, spAtk, spDef, spd, ability1, ability2, item] = cols; // So this lets us destructures the columns into variables, so we can use them later. The order of the columns is important, so we need to make sure we have the right order. And it allows us to skip the columns we don't need, like the "NUM" column, which is not needed because we have the "num" variable already. (check the log file to see the order of the columns)

      return {
        num: Number(num),
        name,
        types: types.split('/').map((t) => t.trim()),
        hp: Number(hp),
        atk: Number(atk),
        def: Number(def),
        spAtk: Number(spAtk),
        spDef: Number(spDef),
        spd: Number(spd),
        ability1,
        ability2: ability2 === '-' ? undefined : ability2,
        heldItems: parseHeldItems(item ?? ''),
      };
    });
}

// ------
// STEP 4 — Random Starters
// ------

/**
 * Parses the --Random Starters-- section.
 *
 * @param lines - The lines of the "Random Starters" section.
 * @returns The species assigned to each of the 3 starter slots.
 */
function parseStarters(lines: string[]): StarterAssignment[] {
  const starters: StarterAssignment[] = [];
  for (const line of lines) {
    const match = /^Set starter (\d) to (.+)$/.exec(line.trim());
    if (match) {
      starters.push({ slot: Number(match[1]) as 1 | 2 | 3, species: match[2].trim() });
    }
  }
  return starters;
}

// --------
// STEP 5 — Pokemon Moveset
// --------


/**
 * Parses a single Pokemon's block from the --Pokemon Movesets-- section
 * (one header line, its level-up moves, and its egg moves).
 *
 * @param block - The lines belonging to one Pokemon, as produced by `splitIntoBlocks`.
 * @returns The Pokemon's pokedex number, species name, level-up moveset and egg moves.
 * @throws If the block's header line doesn't match the expected
 *         "NUM NAME -> ..." format.
 */
function parseMovesetBlock(block: string[]): PokemonMoveset {

  const headerMatch = /^(\d+)\s+(.+?)\s*->/.exec(block[0].trim()); // This is regex, there's actual websites that will explain to you what it does better than I ever will, but basically it captures the pokedex number and the species name from the header line, and ignores the rest of the line. It will also ignore any extra spaces before or after the number and name, and before or after the "->" part. (check the log file to see the format of the header line)
  if (!headerMatch) throw new Error(`Unrecognized moveset header: "${block[0]}"`);

  const pokemonNum = Number(headerMatch[1]);
  const originalSpecies = headerMatch[2].trim();

  const levelUpMoves: LevelUpMove[] = [];
  const eggMoves: string[] = [];
  let inEggMoves = false;

  for (const rawLine of block.slice(1)) {
    const line = rawLine.trim();

    if (line === 'Egg Moves:') {
      inEggMoves = true;
      continue;
    }

    if (inEggMoves) {
      // Egg moves look like " - Purédpois"
      if (line.startsWith('-')) eggMoves.push(line.replace(/^-\s*/, ''));
      continue;
    }

    // Level-up moves: "Level 1 : Voile Miroir" or "Level 13: Rebond"
    // Spaces are inconsistent, so we allow any amount of whitespace around the colon.
    const levelMatch = /^Level\s+(\d+)\s*:\s*(.+)$/.exec(line);
    if (levelMatch) {
      levelUpMoves.push({ level: Number(levelMatch[1]), move: levelMatch[2].trim() });
      continue;
    }
  } // if we reach here, we've finished parsing the block, and we return the parsed data as a PokemonMoveset object.

  return { pokemonNum, originalSpecies, levelUpMoves, eggMoves };
}


/**
 * Parses the whole --Pokemon Movesets-- section.
 *
 * @param lines - The lines of the "Pokemon Movesets" section.
 * @returns One moveset per species, in the order they appear in the file.
 */
function parseMovesets(lines: string[]): PokemonMoveset[] {
  return splitIntoBlocks(lines).map(parseMovesetBlock);
}

// -----
// STEP 6 — TM Moves and TM Compatibility
// --------


/**
 * Parses the --TM Moves-- section (the CT/CS number-to-move-name mapping).
 *
 * @param lines - The lines of the "TM Moves" section.
 * @returns One entry per TM, e.g. `{ id: "TM01", name: "Riposte" }`.
 * @throws If a line doesn't match the expected "TMxx Name" format.
 */
function parseTmMoves(lines: string[]): TmMoveEntry[] {
  return lines
    .filter((l) => l.trim() !== '')
    .map((line) => {
      const match = /^(TM\d+)\s+(.+)$/.exec(line.trim()); // Adds the TM to a match variable that should match TMXX YYYYY and trims it (yes again)
      if (!match) throw new Error(`Unrecognized TM move line: "${line}"`);
      return { id: match[1], name: match[2].trim() };
    });
}


/**
 * Parses the --TM Compatibility-- section.
 *
 * Each row looks like:
 *   "  1 BULBIZARRE    |           - |TM02 Bomb-Beurk | ... |HM08 Escalade |"
 *
 * Splitting on "|" gives: [" 1 BULBIZARRE", " - ", "TM02 Bomb-Beurk", ...,
 * "HM08 Escalade", ""] — note the empty string at the very end, caused by
 * the trailing "|" with nothing after it.
 *
 * Rather than storing the move name on every single row (the file does
 * this, but it's extremely redundant across 700+ species), we only keep a
 * boolean per TM/HM slot, and resolve the actual move names once:
 *  - TM names come from the separate --TM Moves-- section
 *  - HM names have no separate section, so we grab the first non-"-" cell
 *    we see for each HM column and remember it in `hmMoveNames`
 *
 * @param lines - The lines of the "TM Compatibility" section (may include
 *                blank lines and a trailing "Move Tutor Moves: ..." status
 *                line, both skipped).
 * @param tmCount - How many TM columns to expect before the HM columns
 *                  start (i.e. `tmMoves.length` from `parseTmMoves`).
 * @returns `rows`: one compatibility entry per species. `hmMoveNames`: the
 *          HM move names resolved from the table itself, in HM01..HM08 order.
 * @throws If a row's "number + name" column doesn't match the expected format.
 */
function parseTmCompatibility(
  lines: string[],
  tmCount: number,
):

{ rows: TmHmCompatibility[]; hmMoveNames: string[] }

{
  const hmMoveNames: string[] = [];
  const rows: TmHmCompatibility[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!/^\d/.test(line)) continue; // This regex checks if the line starts with a digit, if it doesn't, we skip it because it's not a valid row. This is to avoid parsing lines that are not part of the compatibility table, like blank lines or status lines.

    const cols = line.split('|').map((c) => c.trim());
    if (cols[cols.length - 1] === '') cols.pop(); // drop the empty tail from the final "|"

    const [numAndName, ...slots] = cols;
    const headerMatch = /^(\d+)\s+(.+)$/.exec(numAndName);
    if (!headerMatch) throw new Error(`Unrecognized compatibility row: "${line}"`);

    const tmSlots = slots.slice(0, tmCount);
    const hmSlots = slots.slice(tmCount);

    hmSlots.forEach((slot, i) => {
      if (slot !== '-' && !hmMoveNames[i]) {
        // "HM01 Coupe" -> keep only the move name, drop the "HM01 " id
        hmMoveNames[i] = slot.replace(/^HM\d+\s+/, '');
      }
    });

    rows.push({
      pokemonNum: Number(headerMatch[1]),
      species: headerMatch[2].trim(),
      tmCompatible: tmSlots.map((slot) => slot !== '-'),
      hmCompatible: hmSlots.map((slot) => slot !== '-'),
    });
  }

  return { rows, hmMoveNames };
}

// -------
// STEP 7 — Trainers Pokemon
// -------

/**
 * Parses the --Trainers Pokemon-- section.
 *
 * @param lines - The lines of the "Trainers Pokemon" section.
 * @returns One entry per trainer battle, with its full team (species + level).
 * @throws If a trainer line or one of its team members doesn't match the
 *         expected format.
 */
function parseTrainers(lines: string[]): TrainerEntry[] {
  return lines
    .filter((l) => l.trim() !== '')
    .map((line) => {
      // "#4 (Gamin Yann => Trainer Pansy) - EMPIFLOR Lv11, BOSKARA Lv9"
      const match = /^#(\d+)\s+\((.+?)\s*=>\s*(.+?)\)\s*-\s*(.+)$/.exec(line.trim());
      if (!match) throw new Error(`Unrecognized trainer line: "${line}"`);

      const team = match[4].split(',').map((part) => { // "EMPIFLOR Lv11" or "BOSKARA Lv9"
        const memberMatch = /^(.+?)\s+Lv(\d+)$/.exec(part.trim());
        if (!memberMatch) throw new Error(`Unrecognized team member: "${part}"`);
        return { species: memberMatch[1].trim(), level: Number(memberMatch[2]) }; // This will return an object with the species and level of the team member, and it will be pushed into the team array.
      });

      return {
        index: Number(match[1]),
        originalTrainerName: match[2].trim(),
        randomizedTrainerName: match[3].trim(),
        team,
      };
    });
}

// --------
// STEP 8 — Static Pokemon
// --------


/**
 * Parses the --Static Pokemon-- section (legendaries and other fixed encounters).
 *
 * @param lines - The lines of the "Static Pokemon" section.
 * @returns One entry per static encounter, with `isEgg` set to true when
 *          either side of the line carries the "(egg)" suffix.
 */
function parseStaticEncounters(lines: string[]): StaticEncounter[] {
  return lines
    .filter((l) => l.trim() !== '')
    .map((line) => {
      const [rawFrom, rawTo] = line.split('=>').map((s) => s.trim());
      const isEgg = rawFrom.includes('(egg)') || rawTo.includes('(egg)');
      return {
        original: rawFrom.replace('(egg)', '').trim(),
        randomized: rawTo.replace('(egg)', '').trim(),
        isEgg,
      };
    });
}

// --------------
// STEP 9 — Wild Pokemon
// -------------


/**
   * Known encounter methods, longest first so e.g. "Old Rod" is tried before
 * a shorter partial match. There is no delimiter between the location name
 * and the method in the source file ("Joliberges Surfing"), so this is a
 * best-effort match against a fixed list rather than a "real" parse. If a
 * different randomizer log uses a method not listed here, the fallback
 * below logs a warning instead of silently guessing wrong.
 */
const KNOWN_ENCOUNTER_METHODS = [
  'Swarm/Radar/GBA',
  'Feebas Tiles',
  'Grass/Cave',
  'Old Rod',
  'Good Rod',
  'Super Rod',
  'Surfing',
  'Group 1',
  'Group 2',
  'Group 3',
  // Platinum-specific: Trophy Garden / Great Marsh's daily rotating Pokemon,
  // Warning below will log a warning if the log file uses these methods, since they don't exist in other versions of the randomizer.
  'Rotating Pokemon (via Mr. Backlot)',
  'Rotating Pokemon (Post-National Dex)',
  'Rotating Pokemon (Pre-National Dex)',
].sort((a, b) => b.length - a.length);



/**
 * Splits a wild encounter set's combined "location + method" text (there is
 * no delimiter between the two in normal log files.
 *
 * @param text - The text between "Set #N - " and " (rate=...)", e.g.
 *               "Joliberges Surfing".
 * @returns The location and method, best-effort split. Falls back to
 *          treating the last word as the method (and logs a warning to
 *          the console) if no known method matches.
 */
function splitLocationAndMethod(text: string): { location: string; method: string } {
  for (const method of KNOWN_ENCOUNTER_METHODS) { // EXAMPLE: "Joliberge surfing" inherited from parseWildEncounterHeader
    if (text.endsWith(method)) { // EXAMPLE: "Joliberge surfing" ends with "surfing", so it matches, and we can split the location and method.
      return { location: text.slice(0, -method.length).trim(), method }; // Joliberges Surfing => { location: "Joliberges", method: "Surfing"
    }
  }
  console.warn(`[wild-encounters] Unrecognized method in "${text}", falling back to last word`);
  const words = text.trim().split(/\s+/); // Split the text into words by whitespace, so "Joliberges Surfing" becomes ["Joliberges", "Surfing"]
  return { location: words.slice(0, -1).join(' '), method: words[words.length - 1] }; // Fallback: last word is the method, everything before it is the location
}

/**
 * Parses a wild encounter set's header line.
 *
 * @param line - The header line, e.g. "Set #1 - Joliberges Surfing (rate=10)".
 * @returns The set's id, location, method (via `splitLocationAndMethod`) and encounter rate.
 * @throws If the line doesn't match the expected "Set #N - ... (rate=R)" format.
 */
function parseWildEncounterHeader(line: string) {
  // "Set #1 - Joliberges Surfing (rate=10)"
  const match = /^Set #(\d+) - (.+?) \(rate=(\d+)\)$/.exec(line.trim());
  if (!match) throw new Error(`Unrecognized wild set header: "${line}"`);
  const { location, method } = splitLocationAndMethod(match[2].trim());
  return { setId: Number(match[1]), location, method, rate: Number(match[3]) };
}


/**
 * Parses a single wild encounter line within a set.
 *
 * @param line - The encounter line, e.g.
 *               "APITRINI Lvs 30-45  HP 39  ATK 48  DEF 48  SPATK 30  SPDEF 32  SPEED 47"
 *               or, for a fixed level, "GRODOUDOU Lv8  HP 128 ...".
 * @returns The species, its level range (`levelMin === levelMax` for a
 *          fixed level), and its base stats at that encounter.
 * @throws If the line doesn't match the expected format.
 */
function parseWildEncounterEntry(line: string): WildEncounterEntry {
  // Most entries have a level range: "APITRINI Lvs 30-45  HP 39  ATK 48 ..."
  // but some have a single fixed level instead: "GRODOUDOU Lv8  HP 128 ..."
  // — note "Lv8" has no space before the digit, unlike "Lvs 30-45", so the
  // whitespace between "Lv(s)" and the number has to be optional (\s*, not \s+).
  // Species names can also contain spaces (e.g. "M. MIME"), so the species
  // capture is non-greedy (.+?) instead of \S+, it expands just enough for
  // the rest of the pattern (starting at "Lv") to match.
  const match =
    /^(.+?)\s+Lvs?\s*(\d+)(?:-(\d+))?\s+HP\s+(\d+)\s+ATK\s+(\d+)\s+DEF\s+(\d+)\s+SPATK\s+(\d+)\s+SPDEF\s+(\d+)\s+SPEED\s+(\d+)/.exec(
      line.trim(),
    );
  if (!match) throw new Error(`Unrecognized wild encounter line: "${line}"`);
  const [, species, lvlMin, lvlMax, hp, atk, def, spAtk, spDef, spd] = match;
  return {
    species,
    levelMin: Number(lvlMin),
    // No upper bound in the file ("Lv8") means it's a fixed level, not a range.
    levelMax: lvlMax ? Number(lvlMax) : Number(lvlMin),
    stats: {
      hp: Number(hp),
      atk: Number(atk),
      def: Number(def),
      spAtk: Number(spAtk),
      spDef: Number(spDef),
      spd: Number(spd),
    },
  };
}


/**
 * Parses the whole --Wild Pokemon-- section.
 *
 * @param lines - The lines of the "Wild Pokemon" section.
 * @returns One entry per encounter set (location/method/rate + its list of
 *          possible encounters), in the order they appear in the file.
 */
function parseWildEncounters(lines: string[]): WildEncounterSet[] {
  return splitIntoBlocks(lines).map((block) => {
    const header = parseWildEncounterHeader(block[0]);
    const encounters = block.slice(1).map(parseWildEncounterEntry);
    return { ...header, encounters };
  });
}

// ------------
// STEP 10 — In-Game Tradesx
// ------------



/**
 * Parses the --In-Game Trades-- section.
 *
 * @param lines - The lines of the "In-Game Trades" section.
 * @returns One entry per trade, with the requested species and NPC name
 *          captured once (they're identical on both halves of the source
 *          line — only the given species is randomized).
 * @throws If a line doesn't match the expected
 *         "Trade ... -> ... the ... -> ... -> ... the ..." format.
 */
function parseInGameTrades(lines: string[]): InGameTrade[] {
  return lines
    .filter((l) => l.trim() !== '')
    .map((line) => {
      const normalized = line.trim().replace(/\s+/g, ' ');
      // "Trade MACHOC -> Kazza the ABRA -> MACHOC -> Kazza the TYLTON"
      // The requested species and NPC name are repeated identically on both
      // halves (only the given species is randomized), we only need one half.
      const match = /^Trade (\S+) -> (\S+) the (\S+) -> \S+ -> \S+ the (\S+)$/.exec(normalized);
      if (!match) throw new Error(`Unrecognized trade line: "${line}"`);
      return {
        requestedSpecies: match[1],
        npcName: match[2],
        givenOriginalSpecies: match[3],
        givenRandomizedSpecies: match[4],
      };
    });
}

// ------------
// STEP 11 — Pickup Items
// ------------


/**
 * Parses one level bracket's block from the --Pickup Items-- section.
 *
 * @param block The lines for one level bracket, as produced by
 *                `splitIntoBlocks` (a "Level A-B" header followed by one or
 *                more "P%: item, item, ..." lines).
 * @returns The bracket's level range and its flattened list of
 *          (item name, probability) tiers.
 * @throws If the block's header line doesn't match "Level A-B".
 */
function parsePickupBlock(block: string[]): PickupLevelBracket {
  const headerMatch = /^Level (\d+)-(\d+)$/.exec(block[0].trim()); // example: "Level 1-5" => ["Level 1-5", "1", "5"]
  if (!headerMatch) throw new Error(`Unrecognized pickup bracket header: "${block[0]}"`);

  const tiers: PickupItemTier[] = [];
  for (const line of block.slice(1)) {
    // "10%: Safari Ball, Eau Mystique, CT80, Poké Ball, Baie Micle, Pierre Aube"
    const tierMatch = /^(\d+)%:\s*(.+)$/.exec(line.trim());
    if (!tierMatch) continue;
    const probabilityPercent = Number(tierMatch[1]);
    tierMatch[2].split(',').forEach((name) => {
      tiers.push({ name: name.trim(), probabilityPercent });
    });
  }

  return { levelMin: Number(headerMatch[1]), levelMax: Number(headerMatch[2]), tiers }; // example: { levelMin: 1, levelMax: 5, tiers: [{ name: "Safari Ball", probabilityPercent: 10 }, ...] }
}

/**
 * Parses the whole --Pickup Items-- section.
 *
 * @param lines - The lines of the "Pickup Items" section.
 * @returns One bracket per level range, in the order they appear in the file.
 */
function parsePickupItems(lines: string[]): PickupLevelBracket[] {
  return splitIntoBlocks(lines).map(parsePickupBlock);
}

// ----------
// Main entry
// ----------



/**
 * Parses a full Universal Pokemon Randomizer log, given its raw text
 * content directly, no filesystem access involved. This is what the API
 * route calls with the content of a file the player picked in the browser:
 * a browser never exposes that file's absolute path (blocked for security
 * reasons), only its content, so this is the only entry point a web
 * upload can realistically use. `parseRandomizerLog` below (path-based)
 * is now just a thin wrapper around this one, kept for the CLI.
 *
 * @param logText - The full text content of a randomizer log file.
 * @returns The fully parsed log, matching the `ParsedRandomizerLog` shape
 *          defined in `randomizer-log-schema.ts`.
 * @throws If any expected section is missing from the text, or if a line
 *         within a section doesn't match its expected format.
 */
export function parseRandomizerLogFromText(logText: string): ParsedRandomizerLog {
  const allLines = splitTextIntoLines(logText);
  const sections = splitIntoSections(allLines);

  const getSection = (title: string): string[] => {
    const lines = sections.get(title);
    if (!lines) throw new Error(`Section "${title}" not found in log file`);
    return lines;
  };

  const meta = parseMeta(allLines);
  meta.moveDataStatus = findStatusLine(allLines, 'Move Data');
  meta.moveTutorStatus = findStatusLine(allLines, 'Move Tutor Moves');

  const tmMoves = parseTmMoves(getSection('TM Moves'));
  const { rows: tmHmCompatibility, hmMoveNames } = parseTmCompatibility(
    getSection('TM Compatibility'),
    tmMoves.length,
  );

  return {
    meta,
    evolutions: parseEvolutions(getSection('Randomized Evolutions')),
    baseStats: parseBaseStats(getSection('Pokemon Base Stats & Types')),
    starters: parseStarters(getSection('Random Starters')),
    movesets: parseMovesets(getSection('Pokemon Movesets')),
    tmMoves,
    hmMoveNames,
    tmHmCompatibility,
    trainers: parseTrainers(getSection('Trainers Pokemon')),
    staticEncounters: parseStaticEncounters(getSection('Static Pokemon')),
    wildEncounters: parseWildEncounters(getSection('Wild Pokemon')),
    inGameTrades: parseInGameTrades(getSection('In-Game Trades')),
    pickupItems: parsePickupItems(getSection('Pickup Items')),
  };
}

/**
 * Parses a full Universal Pokemon Randomizer log file, given its path on
 * disk. Only used by the CLI below now (`main`), which naturally has a
 * file path, a command-line argument, rather than text already in memory.
 * The API route uses `parseRandomizerLogFromText` above instead.
 *
 * @param filePath - Path to the randomizer log file to parse.
 * @returns The fully parsed log, matching the `ParsedRandomizerLog` shape
 *          defined in `randomizer-log-schema.ts`.
 * @throws If any expected section is missing from the file, or if a line
 *         within a section doesn't match its expected format.
 */
export function parseRandomizerLog(filePath: string): ParsedRandomizerLog {
  return parseRandomizerLogFromText(readFileSync(filePath, 'utf-8'));
}

// ---------
//
// a real log file:
//
//   node --experimental-strip-types randomizer-log-parser.ts <path-to-log> [output.json]
// ---------

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) {
    console.error('Usage: randomizer-log-parser.ts <path-to-log> [output.json]');
    process.exit(1);
  }

  const parsed = parseRandomizerLog(inputPath);

  console.log('Parsed successfully. Summary:');
  console.log(`  evolutions:         ${parsed.evolutions.length}`);
  console.log(`  baseStats:          ${parsed.baseStats.length}`);
  console.log(`  starters:           ${parsed.starters.length}`);
  console.log(`  movesets:           ${parsed.movesets.length}`);
  console.log(`  tmMoves:            ${parsed.tmMoves.length}`);
  console.log(`  hmMoveNames:        ${parsed.hmMoveNames.length} -> [${parsed.hmMoveNames.join(', ')}]`);
  console.log(`  tmHmCompatibility:  ${parsed.tmHmCompatibility.length}`);
  console.log(`  trainers:           ${parsed.trainers.length}`);
  console.log(`  staticEncounters:   ${parsed.staticEncounters.length}`);
  console.log(`  wildEncounters:     ${parsed.wildEncounters.length}`);
  console.log(`  inGameTrades:       ${parsed.inGameTrades.length}`);
  console.log(`  pickupItems:        ${parsed.pickupItems.length}`);

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(parsed, null, 2), 'utf-8');
    console.log(`\nFull JSON written to ${outputPath}`);
  }
}

// Only runs this file on CLI, not when imported as a module.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}