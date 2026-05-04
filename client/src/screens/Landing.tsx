import { useState } from "react";
import type { AppSocket } from "../socket";
import type { AckCreate, AckJoin, GameType } from "../../../shared/types";
import { MAX_NAME_LEN as NAME_LIMIT } from "../../../shared/types";

export type LandingMode =
  | { kind: "join" }
  | { kind: "join-direct"; code: string }
  | { kind: "admin" };

const GAMES: { id: GameType; name: string; tagline: string }[] = [
  {
    id: "imposter",
    name: "Impromptser",
    tagline: "Spot the player who never saw the prompt.",
  },
  {
    id: "spyfall",
    name: "Spyfall",
    tagline: "Find the spy who doesn't know the location.",
  },
  {
    id: "flip7",
    name: "Flip 7",
    tagline: "Press your luck — collect 7 unique numbers, but don't bust.",
  },
  {
    id: "teeko",
    name: "Tee K.O.",
    tagline: "Doodle logos, write slogans, vote the best t-shirt.",
  },
];

export function Landing({
  socket,
  mode,
  onJoined,
}: {
  socket: AppSocket;
  mode: LandingMode;
  onJoined: (code: string, playerId: string) => void;
}) {
  const [name, setName] = useState(() => localStorage.getItem("name") ?? "");
  const [code, setCode] = useState(
    mode.kind === "join-direct" ? mode.code : ""
  );
  const [gameType, setGameType] = useState<GameType>("imposter");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function persistName(n: string) {
    localStorage.setItem("name", n);
  }

  function create() {
    if (!name.trim()) return setError("Enter a name");
    setBusy(true);
    setError(null);
    persistName(name.trim());
    socket.emit(
      "room:create",
      { name: name.trim(), gameType },
      (res: AckCreate) => {
        setBusy(false);
        if (!res.ok) return setError(res.error);
        onJoined(res.code, res.playerId);
      }
    );
  }

  function join() {
    if (!name.trim()) return setError("Enter a name");
    if (code.trim().length !== 4) return setError("Room code is 4 letters");
    setBusy(true);
    setError(null);
    persistName(name.trim());
    socket.emit(
      "room:join",
      { code: code.trim().toUpperCase(), name: name.trim() },
      (res: AckJoin) => {
        setBusy(false);
        if (!res.ok) return setError(res.error);
        onJoined(res.code, res.playerId);
      }
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <header className="pt-8 text-center">
        <h1 className="text-4xl font-black tracking-tight">Impromptser</h1>
        <p className="mt-2 text-ink/60">Find the imposter. Or be one.</p>
      </header>

      {mode.kind === "join-direct" && (
        <div className="card flex flex-col items-center gap-1 py-5">
          <div className="text-xs uppercase tracking-widest text-ink/50">
            Joining room
          </div>
          <div className="font-mono text-4xl font-black tracking-[0.3em]">
            {mode.code}
          </div>
        </div>
      )}

      <div className="card flex flex-col gap-3">
        <label className="text-sm font-medium text-ink/70">Your name</label>
        <input
          className="input"
          maxLength={NAME_LIMIT}
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="words"
          autoFocus
        />
      </div>

      {mode.kind === "admin" ? (
        <>
          <div className="card flex flex-col gap-3">
            <label className="text-sm font-medium text-ink/70">Game</label>
            <div className="flex flex-col gap-2">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGameType(g.id)}
                  className={[
                    "rounded-2xl border px-4 py-3 text-left transition",
                    gameType === g.id
                      ? "border-accent bg-accent/10"
                      : "border-ink/10 bg-white hover:border-accent/40",
                  ].join(" ")}
                >
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-ink/60">{g.tagline}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="card flex flex-col gap-3">
            <button className="btn-primary" disabled={busy} onClick={create}>
              Create Room
            </button>
            <p className="text-center text-xs text-ink/40">
              You'll be the host. Share the room link with your friends.
            </p>
          </div>
        </>
      ) : mode.kind === "join-direct" ? (
        <div className="card flex flex-col gap-3">
          <button
            className="btn-primary"
            disabled={busy}
            onClick={join}
            onKeyDown={(e) => e.key === "Enter" && join()}
          >
            Join Room
          </button>
        </div>
      ) : (
        <div className="card flex flex-col gap-3">
          <label className="text-sm font-medium text-ink/70">Room code</label>
          <input
            className="input text-center font-mono text-2xl uppercase tracking-[0.4em]"
            maxLength={4}
            placeholder="CODE"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            autoCapitalize="characters"
            autoCorrect="off"
            onKeyDown={(e) => e.key === "Enter" && join()}
          />
          <button className="btn-primary" disabled={busy} onClick={join}>
            Join Room
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
