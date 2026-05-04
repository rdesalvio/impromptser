import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { Flip7Room, RoomStore, TeekoRoom, sanitizeName } from "./rooms.ts";
import type {
  AckCreate,
  AckJoin,
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../shared/types.ts";

const PORT = Number(process.env.PORT ?? 3001);
const ROOM_GRACE_MS = 60_000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true, credentials: true },
});

const store = new RoomStore();

interface SocketData {
  playerId?: string;
  roomCode?: string;
}

io.on("connection", (socket) => {
  const data = socket.data as SocketData;

  function bindRoom(roomCode: string, playerId: string) {
    data.playerId = playerId;
    data.roomCode = roomCode;
    socket.join(`room:${roomCode}`);
  }

  function broadcastRoom(roomCode: string) {
    const room = store.get(roomCode);
    if (!room) return;
    const sockets = io.sockets.adapter.rooms.get(`room:${roomCode}`);
    if (!sockets) return;
    for (const sid of sockets) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      const sd = s.data as SocketData;
      if (!sd.playerId) continue;
      s.emit("room:state", room.publicStateFor(sd.playerId));
    }
  }

  socket.on("room:create", ({ name, gameType }, ack: (r: AckCreate) => void) => {
    const playerId = randomUUID();
    const type =
      gameType === "spyfall"
        ? "spyfall"
        : gameType === "flip7"
          ? "flip7"
          : gameType === "teeko"
            ? "teeko"
            : "imposter";
    const room = store.create(playerId, type);
    const cleanName = sanitizeName(name);
    room.addPlayer(playerId, cleanName);
    bindRoom(room.code, playerId);
    room.on(() => broadcastRoom(room.code));
    ack({ ok: true, code: room.code, playerId });
    broadcastRoom(room.code);
  });

  socket.on("room:join", ({ code, name }, ack: (r: AckJoin) => void) => {
    const room = store.get(code);
    if (!room) return ack({ ok: false, error: "Room not found" });
    const playerId = randomUUID();
    const cleanName = sanitizeName(name);
    const res = room.addPlayer(playerId, cleanName);
    if (!res.ok) return ack({ ok: false, error: res.error ?? "Join failed" });
    bindRoom(room.code, playerId);
    ack({ ok: true, code: room.code, playerId });
    broadcastRoom(room.code);
  });

  socket.on("room:rejoin", ({ code, playerId }, ack: (r: AckJoin) => void) => {
    const room = store.get(code);
    if (!room) return ack({ ok: false, error: "Room not found" });
    const res = room.reconnect(playerId);
    if (!res.ok) return ack({ ok: false, error: res.error ?? "Rejoin failed" });
    bindRoom(room.code, playerId);
    ack({ ok: true, code: room.code, playerId });
    broadcastRoom(room.code);
  });

  socket.on("game:start", () => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!room) return;
    const res = room.startGame(data.playerId);
    if (!res.ok) socket.emit("room:error", res.error ?? "Could not start");
  });

  socket.on("answer:submit", ({ text }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!room) return;
    const res = room.submitAnswer(data.playerId, text);
    if (!res.ok) socket.emit("room:error", res.error ?? "Submit failed");
  });

  socket.on("vote:cast", ({ targetPlayerId }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!room) return;
    const res = room.castVote(data.playerId, targetPlayerId);
    if (!res.ok) socket.emit("room:error", res.error ?? "Vote failed");
  });

  socket.on("vote:call", () => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!room) return;
    const res = room.callVote(data.playerId);
    if (!res.ok) socket.emit("room:error", res.error ?? "Could not call vote");
  });

  socket.on("flip7:hit", () => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof Flip7Room)) return;
    const res = room.hit(data.playerId);
    if (!res.ok) socket.emit("room:error", res.error ?? "Hit failed");
  });

  socket.on("flip7:stay", () => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof Flip7Room)) return;
    const res = room.stay(data.playerId);
    if (!res.ok) socket.emit("room:error", res.error ?? "Stay failed");
  });

  socket.on("flip7:target", ({ targetPlayerId }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof Flip7Room)) return;
    const res = room.target(data.playerId, targetPlayerId);
    if (!res.ok) socket.emit("room:error", res.error ?? "Target failed");
  });

  socket.on("flip7:set-target", ({ targetScore }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof Flip7Room)) return;
    const res = room.setTargetScore(data.playerId, targetScore);
    if (!res.ok) socket.emit("room:error", res.error ?? "Set target failed");
  });

  socket.on("flip7:next-game", () => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof Flip7Room)) return;
    const res = room.nextGame(data.playerId);
    if (!res.ok) socket.emit("room:error", res.error ?? "Reset failed");
  });

  socket.on("teeko:submit-drawing", ({ strokes }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof TeekoRoom)) return;
    const res = room.submitDrawing(data.playerId, strokes);
    if (!res.ok) socket.emit("room:error", res.error ?? "Submit drawing failed");
  });

  socket.on("teeko:submit-slogan", ({ text }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof TeekoRoom)) return;
    const res = room.submitSlogan(data.playerId, text);
    if (!res.ok) socket.emit("room:error", res.error ?? "Submit slogan failed");
  });

  socket.on("teeko:submit-shirts", ({ shirts }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof TeekoRoom)) return;
    const res = room.submitShirts(data.playerId, shirts);
    if (!res.ok) socket.emit("room:error", res.error ?? "Submit shirts failed");
  });

  socket.on("teeko:vote", ({ side }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof TeekoRoom)) return;
    const res = room.vote(data.playerId, side);
    if (!res.ok) socket.emit("room:error", res.error ?? "Vote failed");
  });

  socket.on("teeko:next-game", () => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!(room instanceof TeekoRoom)) return;
    const res = room.nextGame(data.playerId);
    if (!res.ok) socket.emit("room:error", res.error ?? "Reset failed");
  });

  socket.on("chat:send", ({ text }) => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!room) return;
    const res = room.postChat(data.playerId, text);
    if (!res.ok) socket.emit("room:error", res.error ?? "Chat failed");
  });

  socket.on("disconnect", () => {
    if (!data.roomCode || !data.playerId) return;
    const room = store.get(data.roomCode);
    if (!room) return;
    room.markDisconnected(data.playerId);
    if (room.isEmpty()) {
      const code = data.roomCode;
      // Grace window so a player switching apps on mobile (and dropping their socket)
      // can rejoin their freshly-created room. Re-check on expiry — if anyone is
      // back, we leave the room alone.
      setTimeout(() => {
        const r = store.get(code);
        if (r && r.isEmpty()) store.delete(code);
      }, ROOM_GRACE_MS);
    }
  });
});

if (process.env.NODE_ENV !== "production") {
  app.get("/debug/rooms", (_req, res) => {
    res.json(
      store.all().map((r) => ({
        code: r.code,
        phase: r.phase,
        players: [...r.players.values()],
        hostId: r.hostId,
      }))
    );
  });
}

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Not found (client not built yet)");
  });
});

httpServer.listen(PORT, () => {
  console.log(`[impromptser] listening on http://localhost:${PORT}`);
});
