import { io } from "/home/rd/github/impromptser/client/node_modules/socket.io-client/build/esm/index.js";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (fn()) return; await wait(50); }
  throw new Error("timeout: " + fn.toString());
}
function makeClient(name) {
  const sock = io("http://localhost:3001", { transports: ["websocket"] });
  const s = { name, sock, latest: null, errors: [] };
  sock.on("room:state", (st) => { s.latest = st; });
  sock.on("room:error", (e) => { s.errors.push(e); console.log(`[${name}] ERROR: ${e}`); });
  return s;
}

const players = ["Alice", "Bob", "Carol"].map(makeClient);
await wait(300);

const host = players[0];
const code = await new Promise((res) => {
  host.sock.emit("room:create", { name: host.name, gameType: "flip7" }, (r) => {
    if (!r.ok) throw new Error("create failed: " + r.error);
    console.log(`Created flip7 room ${r.code}`);
    res(r.code);
  });
});
for (const p of players.slice(1)) {
  await new Promise((res) => p.sock.emit("room:join", { code, name: p.name }, () => res()));
}
await until(() => host.latest && host.latest.players.length === 3);
console.log(`gameType=${host.latest.gameType}, target=${host.latest.flip7TargetScore}, minPlayers=${host.latest.minPlayers}`);

// Switch target to 50 to make the test quick
host.sock.emit("flip7:set-target", { targetScore: 50 });
await wait(150);
console.log(`new target=${host.latest.flip7TargetScore}`);

host.sock.emit("game:start");
await until(() => host.latest.phase === "ROUND");
console.log(`Round started. Awaiting kind=${host.latest.flip7Round.awaiting.kind}, deck=${host.latest.flip7Round.deckRemaining}`);

// Wait for awaiting state to change (server processed our last input) before acting again.
let lastActedKey = null;
let safetyHits = 0;
const safetyMax = 400;
while (host.latest.phase !== "GAME_OVER" && safetyHits < safetyMax) {
  safetyHits++;
  await wait(60);
  const a = host.latest.flip7Round?.awaiting;
  if (!a) continue;
  // Dedup: don't act twice on the same awaiting state
  const key = `${a.kind}:${a.playerId ?? a.actorId ?? a.targetId}:${a.deadline ?? ""}:${a.cardKind ?? ""}`;
  if (key === lastActedKey) continue;
  if (a.kind === "DECISION") {
    const actor = players.find((p) => p.latest.myId === a.playerId);
    if (!actor) continue;
    const hand = host.latest.flip7Round.hands[actor.latest.myId];
    if (hand.numbers.length < 2) actor.sock.emit("flip7:hit");
    else actor.sock.emit("flip7:stay");
    lastActedKey = key;
  } else if (a.kind === "TARGET") {
    const actor = players.find((p) => p.latest.myId === a.actorId);
    if (!actor) continue;
    let target = a.actorId;
    if (a.cardKind === "GIVE_SC") {
      const eligible = Object.entries(host.latest.flip7Round.hands)
        .find(([id, h]) => id !== a.actorId && h.status === "ACTIVE" && !h.hasSecondChance);
      target = eligible?.[0] ?? a.actorId;
    }
    actor.sock.emit("flip7:target", { targetPlayerId: target });
    lastActedKey = key;
  }
  // FORCED_DRAWING — server is paced, just wait
}
console.log(`After ${safetyHits} interactions, phase=${host.latest.phase}`);

if (host.latest.phase === "GAME_OVER") {
  const round = host.latest.flip7Round;
  console.log(`Winner: ${players.find(p => p.latest.myId === round.gameWinnerId)?.name ?? "?"}`);
  for (const p of host.latest.players) console.log(`  ${p.name}: total=${p.score}`);

  // Test next-game reset
  host.sock.emit("flip7:next-game");
  await until(() => host.latest.phase === "LOBBY", 5000);
  console.log("Reset to lobby. Scores:", host.latest.players.map(p => `${p.name}=${p.score}`).join(", "));
}
players.forEach((p) => p.sock.disconnect());
process.exit(0);
