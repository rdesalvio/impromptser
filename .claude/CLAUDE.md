# Impromptser

A real-time multiplayer party-games platform. Four games today; more can be plugged in. All share a lobby, room codes, and the share-link flow; each game has its own state machine and screens.

- **Imposter** — one player never sees the prompt; others answer it; imposter has to bluff a fitting answer based on the others'.
- **Spyfall** — everyone sees a location card except the spy; players ask each other questions; the room votes for who they think is the spy.
- **Flip 7** — turn-based press-your-luck card game. HIT/STAY draws or banks. Bust on duplicate numbers. Modifier (+N, ×2) and action cards (Freeze, Flip Three, Second Chance) shake things up. First to 50/100/200 (host picks) wins the session.
- **Tee K.O.** — drawing party game. Period 1: draw logos (90s, target 2). Period 2: write slogans (90s, target 4). Then: get dealt a random hand of others' drawings + slogans, build 2 t-shirts, and a single-elimination bracket votes for the winning shirt.

## Architecture

Monorepo, three top-level folders:

- `client/` — Vite + React 18 + Tailwind, talks to the server over Socket.IO. SPA with three URL modes parsed in `App.tsx`:
  - `/` — join (name + code)
  - `/admin` — create room (hidden from regular players); chooses the game
  - `/r/<CODE>` — direct join, code is prefilled (this is the share link)
- `server/` — Express + Socket.IO. Holds all room state in memory. Single-process by design. Also serves `client/dist` as static files in production with an SPA catch-all.
- `shared/types.ts` — wire types and game constants shared by both sides.

### Multi-game model

`server/src/rooms.ts` defines an abstract `RoomBase` with the shared mechanics (players, host, connection lifecycle, lobby, broadcast, timers). Each game is a subclass:

- `ImposterRoom` — `gameType = "imposter"`, phases `LOBBY → ANSWERING → IMPOSTER_ANSWERING → VOTING → RESULTS → (next round | GAME_OVER) → LOBBY`. Multi-round match: host picks 3/5/7 rounds in lobby. Imposter rotation: `recentImposterIds` excludes recent picks. Prompts deduplicate within a session via `pickRandomPromptExcluding(usedPromptIds)`. After the final round's RESULTS, highest cumulative score wins.
- `SpyfallRoom` — `gameType = "spyfall"`, phases `LOBBY → REVEAL → DISCUSS → VOTING → RESULTS`.
- `Flip7Room` — `gameType = "flip7"`, phases `LOBBY → ROUND ↔ ROUND_END → GAME_OVER → LOBBY`. Turn-based engine driven by a single `awaiting` state of kind DECISION (30s decision timer), TARGET (15s pick-a-target after drawing an action card), or FORCED_DRAWING (server-paced ~700ms during a Flip Three sequence). Action cards do not end the actor's turn (decision B). Cumulative `Player.score` carries across rounds; round ends on Flip 7 or all-stopped, then either advances to the next round (8s pause) or transitions to GAME_OVER if any player ≥ target.
- `TeekoRoom` — `gameType = "teeko"`, phases `LOBBY → DRAWING (90s) → WRITING (90s) → COMPOSING (45s) → BRACKET → CHAMPION → LOBBY`. Drawings stored as stroke arrays in the round's in-memory pool — never persisted to disk; pool is cleared when the round ends. `dealHands` deals each player 2 drawings + 4 slogans (preferring others' content if pool has enough). Bracket is single-elimination with random pairings; bye if odd; coinflip on tie. Vote counts hidden until matchup reveal.

`RoomStore.create(hostId, gameType)` instantiates the right one. `RoomStatePublic` carries `gameType` plus a per-game payload (`imposterRound` or `spyfallRound`); the client narrows on `gameType` to render the right screen.

Each socket event mutates the room and the server broadcasts a per-viewer `RoomStatePublic` to every connected socket in that room. The hidden-information player (imposter / spy) gets a different view than the others (`publicStateFor` decides).

Scoring (both games): if the most-voted player/answer is uniquely the imposter/spy, all real players get +1. Otherwise the imposter/spy gets +2.

## Local development

Requires Node 22.6+ (uses native TypeScript type stripping — server runs `.ts` files directly with no build step).

```
npm run setup        # installs server + client, builds client (one-time)
npm run dev          # vite on :5173, server on :3001 (vite proxies socket.io)
npm run typecheck    # tsc --noEmit on both projects
node scripts/smoketest.mjs   # end-to-end imposter run against a running dev server
```

In dev, hit http://localhost:5173. The Vite dev server proxies `/socket.io` and `/debug` to `:3001`.

## Production

`npm run build` produces `client/dist/`. `npm start` runs the server with `NODE_ENV=production`; the server serves the built SPA at every route (SPA catch-all is in `server/src/index.ts`). Single process, in-memory state.

Deployment target: AWS Lightsail (single Ubuntu instance). See `deploy/`:
- `deploy/impromptser.service` — systemd unit (assumes `ubuntu` user, `/home/ubuntu/impromptser`)
- `deploy/Caddyfile` — reverse proxy + auto-TLS, edit the domain before installing

A small Lightsail instance (≤512 MB RAM) needs swap to build — `tsc -b && vite build` will OOM otherwise. 2 GB swapfile is enough.

## Constraints worth knowing

- **Single instance only.** Room state is in process memory. Horizontal scaling requires the Redis Socket.IO adapter and a state store rewrite — explicitly not done.
- **No persistence.** Server restart drops all in-progress rooms. Players reconnect via `room:rejoin` if the room still exists; otherwise they fall back to Landing.
- **Clipboard on share link** uses `navigator.clipboard` (HTTPS / localhost) with a `document.execCommand('copy')` fallback so plain-HTTP deploys still work.
- **Min players differ:** Imposter needs 4; Spyfall, Flip 7, Tee K.O. need 3 (`MIN_PLAYERS_*` in `shared/types.ts`). Max is 10 for all.
- **Drawings are ephemeral.** Tee K.O. stores stroke data in the active round only; `nextGame` clears it; server restart wipes everything. Stroke payload validated server-side via `sanitizeStrokes` (color regex, point count caps).
- **Theme + sounds are client-side**: dark mode (`html.dark` class, CSS-var palette, `ThemeToggle` top-left); sound effects (`client/src/sounds.ts`, Web Audio synthesized — no asset files, `SoundToggle` next to theme). Both persist via localStorage and respect system preference on first load.

## Adding a new game

1. Add the `GameType` literal and any new phases to `shared/types.ts`. Add a `<game>RoundPublic` payload type and a slot on `RoomStatePublic`.
2. Add a `<Game>Room extends RoomBase` in `server/src/rooms.ts` implementing `startGame` + `publicStateFor` and overriding the events it cares about (`submitAnswer`, `castVote`, `callVote`, `postChat`).
3. Wire it into `RoomStore.create`'s switch.
4. Add screens under `client/src/games/<game>/` (one per non-lobby phase). The lobby is shared.
5. In `client/src/App.tsx`, branch on `state.gameType` to route to the new screens.
6. Add a card for the game in the admin picker in `client/src/screens/Landing.tsx`'s `GAMES` list.
7. Add a "How to play" branch in `client/src/screens/Lobby.tsx` keyed on `state.gameType`.

## Files to know

- `server/src/rooms.ts` — `RoomBase` + `ImposterRoom` + `SpyfallRoom` + `Flip7Room` + `TeekoRoom`. Most game-logic changes go here.
- `server/src/index.ts` — socket event wiring, static file serving, debug route.
- `server/src/prompts.ts` — imposter prompt pool.
- `server/src/locations.ts` — Spyfall locations + roles.
- `server/src/cards.ts` — Flip 7 deck builder (94 cards) + Fisher-Yates shuffle.
- `client/src/App.tsx` — URL routing, socket lifecycle, credential persistence (localStorage), screen routing by `(gameType, phase)`.
- `client/src/screens/Landing.tsx` — join + admin (game picker).
- `client/src/screens/Lobby.tsx` — shared lobby; per-game "How to play"; Flip 7 target-score picker (host only).
- `client/src/screens/{Answering,ImposterAnswering,Voting,Results}.tsx` — imposter screens.
- `client/src/components/DrawingCanvas.tsx` — high-DPI Pointer-Events canvas; CSS-driven display sizing (mobile-friendly); strokes captured as `{color,width,points[]}`.
- `client/src/components/DrawingDisplay.tsx` — read-only renderer for stroke arrays at any size.
- `client/src/games/spyfall/{Reveal,Discuss,Voting,Results}.tsx` — Spyfall screens.
- `client/src/games/flip7/{Round,GameOver,PlayerRow,Card}.tsx` — Flip 7 screens. `Round` covers both ROUND and ROUND_END phases.
- `client/src/games/teeko/{Drawing,Writing,Composing,Bracket,Champion}.tsx` — Tee K.O. screens.
- `shared/types.ts` — change here first when adding any client/server message, phase, or game constant.
