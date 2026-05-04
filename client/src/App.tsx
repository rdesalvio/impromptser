import { useEffect, useMemo, useRef, useState } from "react";
import { createSocket, AppSocket } from "./socket";
import type { AckJoin, RoomStatePublic } from "../../shared/types";
import { Landing, LandingMode } from "./screens/Landing";
import { Lobby } from "./screens/Lobby";
import { Answering } from "./screens/Answering";
import { ImposterAnswering } from "./screens/ImposterAnswering";
import { Voting } from "./screens/Voting";
import { Results } from "./screens/Results";
import { SpyfallReveal } from "./games/spyfall/Reveal";
import { SpyfallDiscuss } from "./games/spyfall/Discuss";
import { SpyfallVoting } from "./games/spyfall/Voting";
import { SpyfallResults } from "./games/spyfall/Results";

const STORAGE_KEY = "impromptser:credentials";

interface Credentials {
  code: string;
  playerId: string;
}

function landingModeFromPath(): LandingMode {
  const path = window.location.pathname;
  const roomMatch = path.match(/^\/r\/([A-Za-z0-9]{4})\/?$/);
  if (roomMatch) return { kind: "join-direct", code: roomMatch[1].toUpperCase() };
  if (path === "/admin" || path === "/admin/") return { kind: "admin" };
  return { kind: "join" };
}

function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

function saveCredentials(c: Credentials | null) {
  if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  else localStorage.removeItem(STORAGE_KEY);
}

export default function App() {
  const socketRef = useRef<AppSocket | null>(null);
  if (!socketRef.current) socketRef.current = createSocket();
  const socket = socketRef.current;

  const [credentials, setCredentials] = useState<Credentials | null>(() =>
    loadCredentials()
  );
  const [state, setState] = useState<RoomStatePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      const c = loadCredentials();
      if (c && !state) {
        socket.emit("room:rejoin", c, (res: AckJoin) => {
          if (!res.ok) {
            saveCredentials(null);
            setCredentials(null);
          }
        });
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onState(s: RoomStatePublic) {
      setState(s);
    }
    function onError(msg: string) {
      setError(msg);
      setTimeout(() => setError(null), 3500);
    }
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onState);
    socket.on("room:error", onError);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onState);
      socket.off("room:error", onError);
    };
  }, [socket]);

  function onJoined(code: string, playerId: string) {
    const c = { code, playerId };
    saveCredentials(c);
    setCredentials(c);
  }

  function leave() {
    saveCredentials(null);
    setCredentials(null);
    setState(null);
    socket.disconnect();
    socket.connect();
  }

  const screen = useMemo(() => {
    if (!credentials || !state) {
      return (
        <Landing
          socket={socket}
          mode={landingModeFromPath()}
          onJoined={onJoined}
        />
      );
    }
    if (state.phase === "LOBBY") {
      return <Lobby state={state} socket={socket} />;
    }
    if (state.gameType === "spyfall") {
      switch (state.phase) {
        case "REVEAL":
          return <SpyfallReveal state={state} />;
        case "DISCUSS":
          return <SpyfallDiscuss state={state} socket={socket} />;
        case "VOTING":
          return <SpyfallVoting state={state} socket={socket} />;
        case "RESULTS":
          return <SpyfallResults state={state} />;
      }
    } else {
      switch (state.phase) {
        case "ANSWERING":
          return <Answering state={state} socket={socket} />;
        case "IMPOSTER_ANSWERING":
          return <ImposterAnswering state={state} socket={socket} />;
        case "VOTING":
          return <Voting state={state} socket={socket} />;
        case "RESULTS":
          return <Results state={state} />;
      }
    }
    return null;
  }, [credentials, state, socket]);

  return (
    <div className="min-h-full">
      {!connected && (
        <div className="bg-danger/10 px-3 py-1 text-center text-xs text-danger">
          Reconnecting…
        </div>
      )}
      {credentials && state && (
        <div className="flex items-center justify-between px-4 pt-3 text-xs text-ink/40">
          <span className="font-mono">{state.code}</span>
          <button onClick={leave} className="underline">
            Leave
          </button>
        </div>
      )}
      {error && (
        <div className="mx-auto mt-2 max-w-md rounded-xl bg-danger/10 px-3 py-2 text-center text-sm text-danger">
          {error}
        </div>
      )}
      {screen}
    </div>
  );
}
