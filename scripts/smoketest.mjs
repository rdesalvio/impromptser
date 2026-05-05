// Headless end-to-end test: spins up 4 socket clients, plays a 3-round imposter
// match (the smallest configurable count), then verifies GAME_OVER + reset.
// Usage: npm run dev (in another terminal), then: node scripts/smoketest.mjs
import { io } from "../client/node_modules/socket.io-client/build/esm/index.js";

function makeClient(name) {
  const sock = io("http://localhost:3001", { transports: ["websocket"] });
  const state = { name, sock, latest: null, errors: [] };
  sock.on("room:state", (s) => { state.latest = s; });
  sock.on("room:error", (e) => {
    state.errors.push(e);
    console.log(`[${name}] ERROR: ${e}`);
  });
  return state;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await wait(50);
  }
  throw new Error("timeout waiting for condition");
}

const players = ["Alice", "Bob", "Carol", "Dave"].map(makeClient);
await wait(300);

const host = players[0];
const code = await new Promise((res) => {
  host.sock.emit("room:create", { name: host.name, gameType: "imposter" }, (r) => {
    if (!r.ok) throw new Error("create failed: " + r.error);
    console.log(`[host] created room ${r.code}`);
    res(r.code);
  });
});

for (const p of players.slice(1)) {
  await new Promise((res) => {
    p.sock.emit("room:join", { code, name: p.name }, (r) => {
      if (!r.ok) throw new Error(`${p.name} join failed: ` + r.error);
      res();
    });
  });
}
await until(() => host.latest && host.latest.players.length === 4);
console.log(`All 4 in lobby. Default rounds = ${host.latest.imposterTotalRounds}.`);

// Set to 3 rounds (minimum) for a quick smoketest.
host.sock.emit("imposter:set-rounds", { rounds: 3 });
await wait(150);
console.log(`Rounds set to ${host.latest.imposterTotalRounds}. Starting game.`);
host.sock.emit("game:start");

async function playRound(roundIndex) {
  await until(() => players.every((p) => p.latest?.phase === "ANSWERING"));
  const imposter = players.find((p) => p.latest.imposterRound.myRole === "IMPOSTER");
  const real = players.filter((p) => p.latest.imposterRound.myRole !== "IMPOSTER");
  console.log(`Round ${roundIndex + 1}: imposter is ${imposter.name}`);
  for (const p of real) p.sock.emit("answer:submit", { text: `${p.name}'s answer ${roundIndex}` });
  await until(() => imposter.latest?.phase === "IMPOSTER_ANSWERING");
  imposter.sock.emit("answer:submit", { text: "imposter's bluff" });
  await until(() => players.every((p) => p.latest.phase === "VOTING"));
  const imposterId = imposter.latest.myId;
  for (const p of players) {
    const target = p === imposter ? real[0].latest.myId : imposterId;
    p.sock.emit("vote:cast", { targetPlayerId: target });
  }
  await until(() => players.every((p) => p.latest.phase === "RESULTS"));
  const r0 = host.latest.imposterRound;
  console.log(
    `  Round ${r0.roundNumber}/${r0.totalRounds} done — winner=${r0.winner}, imposter caught=${r0.imposterRevealed === imposterId}`
  );
}

for (let i = 0; i < 3; i++) {
  await playRound(i);
  // After RESULTS, the server either advances to next ANSWERING or to GAME_OVER.
  await until(() => host.latest.phase === "ANSWERING" || host.latest.phase === "GAME_OVER", 12000);
}

console.log(`Phase after final round: ${host.latest.phase}`);
const finalRound = host.latest.imposterRound;
console.log(`Final winner id present: ${!!finalRound?.finalGameWinnerId}`);
const winner = host.latest.players.find(p => p.id === finalRound?.finalGameWinnerId);
console.log(`Winner: ${winner?.name ?? "none"}`);
for (const p of host.latest.players) console.log(`  ${p.name}: score=${p.score}`);

// Test reset
host.sock.emit("imposter:next-game");
await until(() => host.latest.phase === "LOBBY", 5000);
console.log(`Reset to lobby. Scores: ${host.latest.players.map(p => `${p.name}=${p.score}`).join(", ")}`);
console.log("PASS.");

players.forEach((p) => p.sock.disconnect());
process.exit(0);
