// Headless end-to-end test: spins up 4 socket clients, plays one full round
// against a server already running on http://localhost:3001.
// Usage: npm run dev   (in another terminal), then:  node scripts/smoketest.mjs
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
async function until(fn, timeoutMs = 5000) {
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
      console.log(`[${p.name}] joined`);
      res();
    });
  });
}

await until(() => host.latest && host.latest.players.length === 4);
console.log("All 4 in lobby. Starting game.");
host.sock.emit("game:start");

await until(() => players.every((p) => p.latest?.phase === "ANSWERING"));
const imposter = players.find((p) => p.latest.imposterRound.myRole === "IMPOSTER");
const realPlayers = players.filter((p) => p.latest.imposterRound.myRole !== "IMPOSTER");
console.log(`Imposter: ${imposter.name}`);

for (const p of realPlayers) {
  p.sock.emit("answer:submit", { text: `${p.name}'s sunscreen` });
}

await until(() => imposter.latest?.phase === "IMPOSTER_ANSWERING");
console.log(`Imposter sees ${imposter.latest.imposterRound.answers.length} answers`);
imposter.sock.emit("answer:submit", { text: "imposter's towel" });

await until(() => players.every((p) => p.latest.phase === "VOTING"));
console.log("Voting phase reached.");

const imposterId = imposter.latest.myId;
for (const p of players) {
  const target = p === imposter ? realPlayers[0].latest.myId : imposterId;
  p.sock.emit("vote:cast", { targetPlayerId: target });
}
players[1].sock.emit("chat:send", { text: "Definitely the towel guy." });

await until(() => players.every((p) => p.latest.phase === "RESULTS"));
const r0 = players[0].latest.imposterRound;
console.log(
  `Winner: ${r0.winner}, imposter revealed correctly: ${r0.imposterRevealed === imposterId}`
);
for (const p of players[0].latest.players) {
  console.log(`  ${p.name}: score=${p.score}`);
}

await until(() => players.every((p) => p.latest.phase === "LOBBY"), 20000);
console.log("Returned to lobby. PASS.");

players.forEach((p) => p.sock.disconnect());
process.exit(0);
