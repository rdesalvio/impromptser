// Dev-mode bots: spawn additional socket connections that auto-join a room and
// play themselves with simple random/heuristic logic per game type. Lets a
// solo developer test multiplayer flows without juggling tabs.
//
// Bots are gated by `import.meta.env.DEV` at the call sites — no production code
// imports this file.

import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  RoomStatePublic,
  ServerToClientEvents,
} from "../../../shared/types";

export interface Bot {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  name: string;
  playerId: string;
  destroy: () => void;
}

const SLOGAN_POOL = [
  "I'd rather be napping",
  "Powered by snacks",
  "I survived",
  "Don't feed the goblins",
  "404: brain not found",
  "Caffeine + chaos",
  "Mostly harmless",
  "Born to scroll",
  "Ask me about my pet rock",
  "Just kidding (or am I?)",
];

const ANSWER_POOL = [
  "sunscreen",
  "a notebook",
  "a flashlight",
  "headphones",
  "a snack",
  "a charger",
  "extra socks",
  "a water bottle",
  "a pencil",
  "a small umbrella",
  "a frisbee",
  "a deck of cards",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomScribble() {
  const strokes = [];
  const strokeCount = 3 + Math.floor(Math.random() * 4);
  for (let s = 0; s < strokeCount; s++) {
    const points = [];
    const pointCount = 5 + Math.floor(Math.random() * 15);
    let x = 100 + Math.random() * 400;
    let y = 100 + Math.random() * 400;
    for (let i = 0; i < pointCount; i++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      points.push({ x: Math.max(0, Math.min(600, x)), y: Math.max(0, Math.min(600, y)) });
    }
    strokes.push({
      color: pickRandom(["#111111", "#ef4444", "#3b82f6", "#22c55e", "#eab308"]),
      width: 4,
      points,
    });
  }
  return strokes;
}

export function spawnBot(roomCode: string, name: string): Bot {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
    autoConnect: true,
    reconnection: true,
  });

  const bot: Bot = {
    socket,
    name,
    playerId: "",
    destroy: () => {
      socket.disconnect();
    },
  };

  // Track per-state-update what we've already acted on, to avoid repeatedly
  // emitting events for the same state.
  const acted = new Set<string>();

  socket.on("connect", () => {
    socket.emit("room:join", { code: roomCode, name }, (ack) => {
      if (ack.ok) bot.playerId = ack.playerId;
    });
  });

  socket.on("room:state", (state) => {
    if (!bot.playerId) return;
    handleBotAction(socket, bot.playerId, state, acted);
  });

  return bot;
}

function handleBotAction(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  myId: string,
  state: RoomStatePublic,
  acted: Set<string>
) {
  // Helper: act once per "key" so we don't double-fire on identical broadcasts.
  function once(key: string, fn: () => void, delayMs = 600) {
    if (acted.has(key)) return;
    acted.add(key);
    setTimeout(fn, delayMs);
  }

  if (state.gameType === "imposter" && state.imposterRound) {
    const r = state.imposterRound;
    if (state.phase === "ANSWERING" && !r.iSubmittedAnswer && r.myRole === "PLAYER") {
      once(`ans-${r.roundNumber}`, () =>
        socket.emit("answer:submit", { text: pickRandom(ANSWER_POOL) })
      );
    } else if (
      state.phase === "IMPOSTER_ANSWERING" &&
      !r.iSubmittedAnswer &&
      r.myRole === "IMPOSTER"
    ) {
      once(`imp-ans-${r.roundNumber}`, () =>
        socket.emit("answer:submit", { text: pickRandom(ANSWER_POOL) })
      );
    } else if (state.phase === "VOTING" && !r.iVoted) {
      const targets = r.answers.filter((a) => a.ownerId !== myId);
      if (targets.length > 0) {
        const t = pickRandom(targets);
        once(`vote-${r.roundNumber}`, () =>
          socket.emit("vote:cast", { targetPlayerId: t.ownerId })
        );
      }
    }
    return;
  }

  if (state.gameType === "spyfall" && state.spyfallRound) {
    const r = state.spyfallRound;
    if (state.phase === "VOTING" && !r.iVoted) {
      const others = state.players.filter((p) => p.id !== myId);
      if (others.length > 0) {
        const t = pickRandom(others);
        once("spy-vote", () => socket.emit("vote:cast", { targetPlayerId: t.id }));
      }
    }
    return;
  }

  if (state.gameType === "flip7" && state.flip7Round) {
    const r = state.flip7Round;
    const a = r.awaiting;
    if (a.kind === "DECISION" && a.playerId === myId) {
      const hand = r.hands[myId];
      const key = `f7-d-${r.roundNumber}-${hand?.numbers.length}-${hand?.modifiers.length}`;
      once(key, () => {
        if (!hand) return;
        if (hand.numbers.length < 2 || (hand.numbers.length < 4 && Math.random() < 0.6)) {
          socket.emit("flip7:hit");
        } else {
          socket.emit("flip7:stay");
        }
      });
    } else if (a.kind === "TARGET" && a.actorId === myId) {
      const key = `f7-t-${r.roundNumber}-${a.cardKind}-${Date.now()}`;
      once(key, () => {
        let targetPlayerId = myId;
        if (a.cardKind === "GIVE_SC") {
          const eligible = Object.entries(r.hands).find(
            ([id, h]) => id !== myId && h.status === "ACTIVE" && !h.hasSecondChance
          );
          targetPlayerId = eligible ? eligible[0] : myId;
        }
        socket.emit("flip7:target", { targetPlayerId });
      });
    }
    return;
  }

  if (state.gameType === "teeko" && state.teekoRound) {
    const r = state.teekoRound;
    if (state.phase === "DRAWING" && r.drawing) {
      // Submit up to the target, spaced out.
      if (r.drawing.mySubmitted < r.drawing.target) {
        once(`tk-d-${r.drawing.mySubmitted}`, () =>
          socket.emit("teeko:submit-drawing", { strokes: randomScribble() }), 800 + Math.random() * 600
        );
      }
    } else if (state.phase === "WRITING" && r.writing) {
      if (r.writing.mySubmitted < r.writing.target) {
        once(`tk-s-${r.writing.mySubmitted}`, () =>
          socket.emit("teeko:submit-slogan", { text: pickRandom(SLOGAN_POOL) }), 600 + Math.random() * 600
        );
      }
    } else if (state.phase === "COMPOSING" && r.composing && r.composing.myHand && !r.composing.submitted) {
      const hand = r.composing.myHand;
      if (hand.drawings.length >= 2 && hand.slogans.length >= 2) {
        once("tk-c", () =>
          socket.emit("teeko:submit-shirts", {
            shirts: [
              { drawingId: hand.drawings[0].id, sloganId: hand.slogans[0].id },
              { drawingId: hand.drawings[1].id, sloganId: hand.slogans[1].id },
            ],
          })
        );
      }
    } else if (state.phase === "BRACKET" && r.bracket) {
      const m = r.bracket.matchup;
      if (m && !m.revealed && !m.byeShirt && m.myVote === undefined) {
        const left = !m.iContributedLeft;
        const right = !m.iContributedRight;
        let side: "LEFT" | "RIGHT" | null = null;
        if (left && right) side = Math.random() < 0.5 ? "LEFT" : "RIGHT";
        else if (left) side = "LEFT";
        else if (right) side = "RIGHT";
        if (side) {
          const key = `tk-v-${r.bracket.currentRound}-${r.bracket.matchupIndex}`;
          once(key, () => socket.emit("teeko:vote", { side: side! }));
        }
      }
    }
    return;
  }
}
