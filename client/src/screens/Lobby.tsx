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
    let ok = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        ok = true;
      } catch {
        // fall through to legacy path
      }
    }
    if (!ok) {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-medium text-ink/70">How to play</div>
          <div className="text-xs uppercase tracking-widest text-ink/40">
            {state.gameType === "spyfall" ? "Spyfall" : "Impromptser"}
          </div>
        </div>
        {state.gameType === "spyfall" ? (
          <ol className="flex flex-col gap-2 text-sm text-ink/70">
            <li className="flex gap-2">
              <span className="font-bold text-accent">1.</span>
              <span>
                Everyone gets a card with the <span className="font-semibold">location</span>{" "}
                and a role — except one player, the <span className="font-semibold">spy</span>,
                who only knows they're the spy.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-accent">2.</span>
              <span>
                Players take turns asking each other questions to figure out
                who's bluffing — without saying the location out loud.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-accent">3.</span>
              <span>
                The spy listens carefully and tries to figure out the location
                without giving themselves away.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-accent">4.</span>
              <span>
                When the timer ends — or anyone calls a vote — everyone votes
                for who they think the spy is. Catch the spy: players +1 each.
                Spy survives: spy +2.
              </span>
            </li>
          </ol>
        ) : (
          <ol className="flex flex-col gap-2 text-sm text-ink/70">
            <li className="flex gap-2">
              <span className="font-bold text-accent">1.</span>
              <span>
                One player is secretly the <span className="font-semibold">imposter</span>.
                Everyone else sees a prompt and writes a short answer.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-accent">2.</span>
              <span>
                The imposter sees only the others' answers — no prompt — and must
                bluff an answer that fits in.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-accent">3.</span>
              <span>
                Everyone reads all the answers, chats, and votes for who they
                think the imposter is.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-accent">4.</span>
              <span>
                If the imposter gets the most votes, the players win the round
                (+1 each). Otherwise the imposter wins (+2).
              </span>
            </li>
          </ol>
        )}
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
