import type { RoomStatePublic } from "../../../../shared/types";
import { Timer } from "../../components/Timer";

export function SpyfallResults({ state }: { state: RoomStatePublic }) {
  const round = state.spyfallRound!;
  const playerNameById: Record<string, string> = Object.fromEntries(
    state.players.map((p) => [p.id, p.name])
  );
  const spyName = round.spyRevealed
    ? playerNameById[round.spyRevealed] ?? "?"
    : "?";
  const playersWon = round.winner === "PLAYERS";

  const voteCounts: Record<string, number> = {};
  for (const target of Object.values(round.votes)) {
    voteCounts[target] = (voteCounts[target] ?? 0) + 1;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
          Results
        </div>
        <Timer endsAt={round.phaseEndsAt} />
      </div>

      <div
        className={[
          "card flex flex-col items-center gap-2 py-8 text-center",
          playersWon
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-danger/40 bg-danger/5",
        ].join(" ")}
      >
        <div className="text-5xl">{playersWon ? "🎉" : "🕵️"}</div>
        <div className="text-2xl font-black">
          {playersWon ? "Players Win!" : "Spy Wins!"}
        </div>
        <div className="text-sm text-ink/60">
          {playersWon
            ? `You sniffed out ${spyName}.`
            : `${spyName} got away.`}
        </div>
        <div className="mt-2 text-xs uppercase tracking-widest text-ink/50">
          Location was
        </div>
        <div className="text-lg font-semibold">{round.actualLocation}</div>
      </div>

      <div className="card">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
          Votes
        </div>
        <ul className="flex flex-col gap-2">
          {state.players.map((p) => {
            const isSpy = p.id === round.spyRevealed;
            const votes = voteCounts[p.id] ?? 0;
            return (
              <li
                key={p.id}
                className={[
                  "flex items-center justify-between rounded-xl border px-3 py-2",
                  isSpy
                    ? "border-danger/40 bg-danger/5"
                    : "border-ink/10 bg-surface",
                ].join(" ")}
              >
                <div>
                  <div className="text-sm font-medium">
                    {p.name}
                    {isSpy && (
                      <span className="ml-2 text-xs font-semibold text-danger">
                        SPY
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs font-semibold tabular-nums text-ink/60">
                  {votes} vote{votes === 1 ? "" : "s"}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
          Scores
        </div>
        <ul className="flex flex-col divide-y divide-ink/5">
          {[...state.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between py-2"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-sm tabular-nums">{p.score}</span>
              </li>
            ))}
        </ul>
      </div>

      <div className="text-center text-xs text-ink/40">
        Returning to lobby…
      </div>
    </div>
  );
}
