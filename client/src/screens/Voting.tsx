import { useEffect, useRef, useState } from "react";
import type { AppSocket } from "../socket";
import type { RoomStatePublic } from "../../../shared/types";
import { MAX_CHAT_LEN } from "../../../shared/types";
import { Timer } from "../components/Timer";

export function Voting({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.round!;
  const [chatText, setChatText] = useState("");
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [round.chat.length]);

  const myConfirmedVote = round.votes[state.myId] ?? null;
  useEffect(() => {
    if (pendingVote && myConfirmedVote === pendingVote) setPendingVote(null);
  }, [pendingVote, myConfirmedVote]);

  function castVote(targetPlayerId: string) {
    if (targetPlayerId === state.myId) return;
    setPendingVote(targetPlayerId);
    socket.emit("vote:cast", { targetPlayerId });
  }

  function sendChat() {
    const t = chatText.trim();
    if (!t) return;
    socket.emit("chat:send", { text: t });
    setChatText("");
  }

  const playerNameById: Record<string, string> = Object.fromEntries(
    state.players.map((p) => [p.id, p.name])
  );

  const votersByOwner: Record<string, string[]> = {};
  for (const [voterId, targetId] of Object.entries(round.votes)) {
    (votersByOwner[targetId] ??= []).push(voterId);
  }
  const effectiveVote = pendingVote ?? myConfirmedVote;
  const totalVoters = state.players.filter((p) => p.connected).length;
  const totalVotesCast = Object.keys(round.votes).length;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
          Vote: who's the imposter?
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
                disabled={isMine}
                onClick={() => castVote(a.ownerId)}
                className={[
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  isMine
                    ? "cursor-not-allowed border-ink/10 bg-ink/5 text-ink/50"
                    : showSelected
                      ? "border-accent bg-accent/10"
                      : "border-ink/10 bg-white hover:border-accent/40",
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

      <div className="card flex flex-col gap-2">
        <div className="text-xs font-medium text-ink/60">Chat</div>
        <div
          ref={chatRef}
          className="max-h-40 min-h-[5rem] overflow-y-auto rounded-xl bg-ink/5 p-2"
        >
          {round.chat.length === 0 ? (
            <div className="px-1 py-2 text-center text-xs text-ink/40">
              Accuse, defend, distract…
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {round.chat.map((m) => (
                <li key={m.id} className="text-sm">
                  <span className="font-semibold">
                    {playerNameById[m.playerId] ?? m.playerName}:
                  </span>{" "}
                  <span>{m.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Say something…"
            maxLength={MAX_CHAT_LEN}
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
          />
          <button className="btn-secondary" onClick={sendChat}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
