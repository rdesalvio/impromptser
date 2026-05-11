import { useEffect, useState } from "react";
import type { AppSocket } from "../socket";
import type { RoomStatePublic } from "../../../shared/types";
import { ChatPanel } from "../components/ChatPanel";
import { Timer } from "../components/Timer";

export function Voting({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.imposterRound!;
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const me = state.players.find((p) => p.id === state.myId);
  const isSpectator = me?.isSpectator ?? false;

  const myConfirmedVote = round.votes[state.myId] ?? null;
  useEffect(() => {
    if (pendingVote && myConfirmedVote === pendingVote) setPendingVote(null);
  }, [pendingVote, myConfirmedVote]);

  function castVote(targetPlayerId: string) {
    if (isSpectator || targetPlayerId === state.myId) return;
    setPendingVote(targetPlayerId);
    socket.emit("vote:cast", { targetPlayerId });
  }

  const playerNameById: Record<string, string> = Object.fromEntries(
    state.players.map((p) => [p.id, p.name])
  );

  const votersByOwner: Record<string, string[]> = {};
  for (const [voterId, targetId] of Object.entries(round.votes)) {
    (votersByOwner[targetId] ??= []).push(voterId);
  }
  const effectiveVote = pendingVote ?? myConfirmedVote;
  const totalVoters = state.players.filter((p) => p.connected && !p.isSpectator).length;
  const totalVotesCast = Object.keys(round.votes).length;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
          Round {round.roundNumber}/{round.totalRounds} · Who's the imposter?
        </div>
        <Timer endsAt={round.phaseEndsAt} />
      </div>

      <div className="card text-center">
        <div className="text-xs uppercase tracking-widest text-ink/40">
          Prompt
        </div>
        <div className="mt-1 text-lg font-semibold">
          {round.promptForRealPlayers}
        </div>
        <div className="mt-2 text-xs text-ink/50 tabular-nums">
          {totalVotesCast}/{totalVoters} voted
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {round.answers.map((a) => {
          const isMine = a.ownerId === state.myId;
          const showSelected = effectiveVote === a.ownerId;
          const voters = votersByOwner[a.ownerId] ?? [];
          const count = voters.length;
          return (
            <li key={a.ownerId}>
              <button
                disabled={isMine || isSpectator}
                onClick={() => castVote(a.ownerId)}
                className={[
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  isMine
                    ? "cursor-not-allowed border-ink/10 bg-ink/5 text-ink/50"
                    : showSelected
                      ? "border-accent bg-accent/10"
                      : "border-ink/10 bg-surface hover:border-accent/40",
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 text-base">{a.text}</div>
                  <div
                    className={[
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                      count === 0
                        ? "bg-ink/5 text-ink/40"
                        : "bg-accent text-white",
                    ].join(" ")}
                    aria-label={`${count} votes`}
                  >
                    {count}
                  </div>
                </div>
                {voters.length > 0 && (
                  <div className="mt-1 text-xs text-ink/50">
                    {voters
                      .map((id) => playerNameById[id] ?? "?")
                      .join(", ")}
                  </div>
                )}
                {isMine && (
                  <div className="mt-1 text-xs text-ink/40">(your answer)</div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <ChatPanel
        className="card"
        messages={round.chat}
        socket={socket}
        players={state.players}
        emptyPlaceholder="Accuse, defend, distract…"
      />
    </div>
  );
}
