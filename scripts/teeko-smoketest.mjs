// Full Tee K.O. end-to-end. Runs ~4 minutes (90 + 90 + 45 + bracket).
// Requires the dev server on :3001.
import { io } from "../client/node_modules/socket.io-client/build/esm/index.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 240000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await wait(100);
  }
  throw new Error("timeout: " + fn);
}

function makeClient(name) {
  const sock = io("http://localhost:3001", { transports: ["websocket"] });
  const s = { name, sock, latest: null, errors: [] };
  sock.on("room:state", (st) => { s.latest = st; });
  sock.on("room:error", (e) => { s.errors.push(e); console.log(`[${name}] ERR: ${e}`); });
  return s;
}

const players = ["Alice", "Bob", "Carol"].map(makeClient);
await wait(300);

const code = await new Promise((res) =>
  players[0].sock.emit("room:create", { name: "Alice", gameType: "teeko" }, (r) => res(r.code))
);
console.log(`Created teeko room ${code}`);
for (const p of players.slice(1)) {
  await new Promise((res) => p.sock.emit("room:join", { code, name: p.name }, () => res()));
}
await until(() => players[0].latest?.players.length === 3);
players[0].sock.emit("game:start");

await until(() => players[0].latest?.phase === "DRAWING");
console.log("DRAWING phase");
for (const p of players) {
  for (let i = 0; i < 2; i++) {
    p.sock.emit("teeko:submit-drawing", {
      strokes: [
        {
          color: "#000000",
          width: 4,
          points: [
            { x: 50, y: 50 },
            { x: 200, y: 100 + i * 50 },
            { x: 400, y: 200 },
          ],
        },
      ],
    });
  }
}
console.log("Submitted 2 drawings each. Waiting for WRITING…");
await until(() => players[0].latest?.phase === "WRITING");

console.log("WRITING phase");
for (const p of players) {
  for (let i = 0; i < 4; i++) {
    p.sock.emit("teeko:submit-slogan", { text: `${p.name}'s slogan #${i + 1}` });
  }
}
console.log("Submitted 4 slogans each. Waiting for COMPOSING…");
await until(() => players[0].latest?.phase === "COMPOSING");

console.log("COMPOSING phase");
// Each player has a hand of 2 drawings + 4 slogans. Build 2 shirts.
for (const p of players) {
  await wait(150); // let the state propagate to each
  const hand = p.latest?.teekoRound?.composing?.myHand;
  if (!hand) { console.log(`[${p.name}] no hand?`); continue; }
  const shirts = [
    { drawingId: hand.drawings[0].id, sloganId: hand.slogans[0].id },
    { drawingId: hand.drawings[1].id, sloganId: hand.slogans[1].id },
  ];
  p.sock.emit("teeko:submit-shirts", { shirts });
}
console.log("Submitted shirts. Waiting for BRACKET…");
await until(() => players[0].latest?.phase === "BRACKET");

console.log("BRACKET phase");
let lastMatchupKey = null;
let matchups = 0;
const matchupCap = 30;
while (players[0].latest?.phase === "BRACKET" && matchups < matchupCap) {
  await wait(100);
  const m = players[0].latest?.teekoRound?.bracket?.matchup;
  if (!m) continue;
  const key = `r${players[0].latest.teekoRound.bracket.currentRound}-m${players[0].latest.teekoRound.bracket.matchupIndex}-rev${m.revealed}`;
  if (key === lastMatchupKey) continue;
  lastMatchupKey = key;
  if (m.byeShirt) {
    matchups++;
    console.log(`  Match (bye): ${players[0].latest.teekoRound.bracket.currentRound}/${players[0].latest.teekoRound.bracket.totalRounds}`);
    continue;
  }
  if (!m.revealed) {
    matchups++;
    // Each player votes — respecting the no-self-vote rule.
    for (const p of players) {
      // Use this player's view (matchup flags are per-viewer).
      const myMatchup = p.latest?.teekoRound?.bracket?.matchup;
      if (!myMatchup) continue;
      const left = !myMatchup.iContributedLeft;
      const right = !myMatchup.iContributedRight;
      let side;
      if (left && right) side = Math.random() < 0.5 ? "LEFT" : "RIGHT";
      else if (left) side = "LEFT";
      else if (right) side = "RIGHT";
      else continue; // both are mine — sit out
      p.sock.emit("teeko:vote", { side });
    }
    console.log(`  Match ${players[0].latest.teekoRound.bracket.matchupIndex}/${players[0].latest.teekoRound.bracket.matchupsInRound} of round ${players[0].latest.teekoRound.bracket.currentRound}/${players[0].latest.teekoRound.bracket.totalRounds}`);
  }
}

await until(() => players[0].latest?.phase === "CHAMPION", 600000);
console.log("CHAMPION");
const champ = players[0].latest.teekoRound?.champion;
console.log(`  Slogan: "${champ.shirt.slogan.text}"`);
console.log(`  Composer: ${players.find(p => p.latest.myId === champ.composerId)?.name}`);

// Reset
players[0].sock.emit("teeko:next-game");
await until(() => players[0].latest?.phase === "LOBBY", 5000);
console.log("Returned to lobby. PASS.");

players.forEach((p) => p.sock.disconnect());
process.exit(0);
