BE AWARE THIS IS AN EXTREMELY EARLY BUILD


######Ironmon Run Analyzer######

A companion web app for the Pokémon Ironmon challenge (a roguelike-style run where the ROM is re-randomized on every death/reset, typically played with the community Ironmon-Tracker Lua script on ***)

The app tracks a run in two tiers:

Live data (current species encountered, their known moves, items picked up), safe to show while the run is still active, since it only ever reflects what's actually been observed in-game. No spoilers.
Archive data (the full randomizer log: evolutions, movesets, TM/HM compatibility, trainers, wild encounters, static encounters, trades, pickup tables) — stored the moment a run starts, but only readable once the run has ended. Deletable independently of the run itself, so you can throw away the spoilers while keeping lightweight stats (seed, starter, duration, cause of death) for cross-run tracking.


#####Stack######

Backend (run-analyzer-back/)

Node.js, running TypeScript natively (node --experimental-strip-types, no build step)
Express — REST API
Prisma ORM 7 (prisma-client provider + @prisma/adapter-pg driver adapter) over PostgreSQL, hosted on Supabase
cors for local cross-origin requests between the Vite dev server and the API

Frontend (run-analyzer-frontend/)

React + TypeScript, scaffolded with Vite
SCSS (via sass-embedded), strict BEM naming, one partial per component
Centralized api.ts client — every component talks to the backend through typed functions, never raw fetch() calls

######What's implemented#####

Log parser (randomizer-log-parser.ts): parses a Universal Pokemon Randomizer log file into a structured object, section by section (evolutions, base stats, starters, movesets, TM/HM data, trainers, static/wild encounters, in-game trades, pickup items). Exposes both a path-based entry point (CLI) and a text-based one (used by the API, so a browser-uploaded file's content, never its path which browsers don't expose, can be parsed directly).
REST API (runs.ts): create a run from a log's content, record encounters/items as they're observed, end a run, list run history, read/delete a run's archive (locked until the run has ended).
Manual entry forms: log encounters (species, move, context — wild/trainer/static/trade) and items by hand while playing.
Live dashboard: read-only view of everything observed so far in the active run.
Run lifecycle: start a run from an uploaded log file, end it, resume a still-active run from history.
Run history: every past run, with "View archive" / "Delete archive" for ended runs (hidden once an archive has actually been deleted, synced with the database rather than assumed).


######Not yet built#######

Automated data submission from the real Ironmon-Tracker Lua script (bridging its existing detection of wild/trainer battles, badges, etc. to this API) — the API is already designed so a script could call the same endpoints the manual forms use, with no backend changes needed.
Visual polish pass (styling exists but is intentionally minimal so far).


THIS PROJECT IS OPEN SOURCE, YOU CAN EITHER BRANCH THIS PROJECT OR DOWNLOAD THE WHOLE REPO.
AND DON'T FORGET, IF YOU LIKE REGEX, SEEK HELP.
