import { useState } from "react";
import type { AppSocket } from "../socket";
import type { RoomStatePublic } from "../../../shared/types";

export function Lobby({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const isHost = state.myId === state.hostId;
  const connected = state.players.filter((p) => p.connected);
  const canStart = isHost && connected.length >= state.minPlayers;
  const shareUrl = `${window.location.origin}/r/${state.code}`;
  const [copied, setCopied] = useState(false);

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be unavailable on http or unsupported browsers
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between pt-4">
        <h2 className="text-xl font-bold">Lobby</h2>
        <div className="text-sm text-ink/50">
          {connected.length}/{state.minPlayers}+ players
        </div>
      </div>

      <div className="card flex flex-col items-center gap-3 py-6">
        <div className="text-xs uppercase tracking-widest text-ink/50">
          Room code
        </div>
        <div className="font-mono text-5xl font-black tracking-[0.3em]">
          {state.code}
        </div>
        <button
          onClick={copyShare}
          className="mt-1 w-full rounded-xl border border-ink/10 bg-ink/5 px-3 py-2 text-center transition hover:border-accent/40"
        >
          <div className="truncate text-sm font-mono text-ink/70">
            {shareUrl}
          </div>
          <div className="mt-1 text-xs font-medium text-accent">
            {copied ? "Copied!" : "Tap to copy share link"}
          </div>
        </button>
      </div>

      <div className="card">
        <div className="mb-2 text-sm font-medium text-ink/70">Players</div>
        <ul className="flex flex-col divide-y divide-ink/5">
          {state.players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    p.connected ? "bg-emerald-500" : "bg-ink/20"
                  }`}
                />
                <span className="font-medium">{p.name}</span>
                {p.id === state.hostId && (
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                    HOST
                  </span>
                )}
                {p.id === state.myId && (
                  <span className="text-xs text-ink/40">(you)</span>
                )}
              </div>
              <div className="text-xs text-ink/40 tabular-nums">{p.score}</div>
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <button
          className="btn-primary"
          disabled={!canStart}
          onClick={() => socket.emit("game:start")}
        >
          {canStart
            ? "Start Game"
            : `Waiting for ${state.minPlayers - connected.length} more…`}
        </button>
      ) : (
        <div className="text-center text-sm text-ink/50">
          Waiting for the host to start…
        </div>
      )}
    </div>
  );
}
