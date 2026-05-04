import { useEffect, useState } from "react";
import type { AppSocket } from "../../socket";
import type { RoomStatePublic } from "../../../../shared/types";
import { PlayerRow } from "./PlayerRow";

export function Flip7Round({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.flip7Round!;
  const myHand = round.hands[state.myId];
  const playersById = Object.fromEntries(state.players.map((p) => [p.id, p]));

  const awaiting = round.awaiting;
  const isMyDecision = awaiting.kind === "DECISION" && awaiting.playerId === state.myId;
  const isMyTarget = awaiting.kind === "TARGET" && awaiting.actorId === state.myId;
  const forcedDrawerId =
    awaiting.kind === "FORCED_DRAWING" ? awaiting.targetId : round.flipThree?.targetId;

  // ----- timer ticker -----
  const deadline =
    "deadline" in awaiting ? awaiting.deadline : undefined;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  // ----- leader -----
  const leader = [...state.players].sort((a, b) => b.score - a.score)[0];

  // ----- target eligibility -----
  function isTargetableForAction(playerId: string): boolean {
    if (!isMyTarget || awaiting.kind !== "TARGET") return false;
    const hand = round.hands[playerId];
    if (!hand) return false;
    if (awaiting.cardKind === "GIVE_SC") {
      return playerId !== state.myId && hand.status === "ACTIVE" && !hand.hasSecondChance;
    }
    return hand.status === "ACTIVE";
  }

  const turnOrder = round.turnOrder;
  const orderedPlayers = turnOrder
    .map((id) => playersById[id])
    .filter(Boolean);

  // ----- action area copy -----
  const isRoundEnd = state.phase === "ROUND_END";

  const watcherCopy = (() => {
    if (awaiting.kind === "DECISION") {
      const name = playersById[awaiting.playerId]?.name ?? "?";
      return `${name}'s turn — deciding…`;
    }
    if (awaiting.kind === "TARGET") {
      const name = playersById[awaiting.actorId]?.name ?? "?";
      const verb =
        awaiting.cardKind === "FREEZE"
          ? "is choosing who to freeze"
          : awaiting.cardKind === "FLIP3"
            ? "is choosing who to Flip Three"
            : "is choosing who to give Second Chance";
      return `${name} ${verb}…`;
    }
    if (awaiting.kind === "FORCED_DRAWING") {
      const name = playersById[awaiting.targetId]?.name ?? "?";
      if (round.flipThree) {
        return `${name} is being forced to draw… (${round.flipThree.remaining} left)`;
      }
      return `Dealing initial card to ${name}…`;
    }
    return "";
  })();

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-3 pb-4">
      {/* Header */}
      <div className="card flex flex-col gap-1 py-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
            Round {round.roundNumber}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
            First to {round.targetScore}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div>
            Leader: <span className="font-semibold">{leader?.name ?? "—"}</span>{" "}
            <span className="tabular-nums text-ink/70">{leader?.score ?? 0}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink/60">
            <span>Deck {round.deckRemaining}</span>
            {remaining !== null && (
              <span
                className={`tabular-nums font-semibold ${remaining <= 5 ? "text-danger" : "text-ink"}`}
              >
                {remaining}s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Player rows */}
      <ul className="flex flex-col gap-2">
        {orderedPlayers.map((p) => {
          const hand = round.hands[p.id];
          if (!hand) return null;
          const isCurrent =
            awaiting.kind === "DECISION" && awaiting.playerId === p.id;
          return (
            <li key={p.id}>
              <PlayerRow
                player={p}
                hand={hand}
                isCurrent={isCurrent}
                isMe={p.id === state.myId}
                isTargetable={isTargetableForAction(p.id)}
                onTarget={() =>
                  socket.emit("flip7:target", { targetPlayerId: p.id })
                }
                isForcedDrawer={!!forcedDrawerId && forcedDrawerId === p.id}
              />
            </li>
          );
        })}
      </ul>

      {/* Activity log */}
      {round.recentEvents.length > 0 && (
        <div className="rounded-xl bg-ink/5 px-3 py-2 text-xs text-ink/70">
          <span className="font-semibold uppercase tracking-wider text-ink/40">Activity:</span>{" "}
          {round.recentEvents
            .slice(-2)
            .map((e) => e.text)
            .join("  ·  ")}
        </div>
      )}

      {/* Action area */}
      {isRoundEnd ? (
        <div className="card flex flex-col items-center gap-1 py-4 text-center">
          <div className="text-sm font-semibold">Round complete</div>
          <div className="text-xs text-ink/60">
            Next round in {Math.ceil((round.roundOverIn ?? 0) / 1000)}s
          </div>
        </div>
      ) : isMyDecision ? (
        <div className="sticky bottom-2 mt-1">
          <div className="card flex flex-col gap-3 border-accent bg-accent/5 py-4">
            <div className="text-center text-sm font-semibold">
              YOUR TURN  ·  {myHand?.numbers.length ?? 0}/7 unique  ·  Hand{" "}
              {myHand?.roundScore ?? 0}
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                onClick={() => socket.emit("flip7:hit")}
              >
                HIT
              </button>
              <button
                className="btn-secondary flex-1"
                onClick={() => socket.emit("flip7:stay")}
              >
                STAY
              </button>
            </div>
          </div>
        </div>
      ) : isMyTarget ? (
        <div className="sticky bottom-2 mt-1">
          <div className="card flex flex-col gap-2 border-accent bg-accent/5 py-3">
            <div className="text-center text-sm font-semibold">
              {awaiting.kind === "TARGET" && awaiting.cardKind === "FREEZE" && "You drew FREEZE — pick a target above"}
              {awaiting.kind === "TARGET" && awaiting.cardKind === "FLIP3" && "You drew FLIP THREE — pick a target above"}
              {awaiting.kind === "TARGET" && awaiting.cardKind === "GIVE_SC" && "You already have Second Chance — give this one to another player"}
            </div>
            <div className="text-center text-xs text-ink/60">Tap a highlighted player row</div>
          </div>
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-1 py-3 text-center">
          <div className="text-sm font-medium text-ink/70">{watcherCopy}</div>
        </div>
      )}

    </div>
  );
}
