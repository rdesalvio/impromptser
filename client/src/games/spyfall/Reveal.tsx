import type { RoomStatePublic } from "../../../../shared/types";
import { Timer } from "../../components/Timer";

export function SpyfallReveal({ state }: { state: RoomStatePublic }) {
  const round = state.spyfallRound!;
  const isSpy = round.myRole === "SPY";

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between pt-4">
        <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
          Your card
        </div>
        <Timer endsAt={round.phaseEndsAt} />
      </div>

      {isSpy ? (
        <div className="card flex flex-col items-center gap-3 border-danger/40 bg-danger/5 py-10 text-center">
          <div className="text-6xl">🕵️</div>
          <div className="text-3xl font-black text-danger">YOU ARE THE SPY</div>
          <div className="text-sm text-ink/60">
            You don't know the location. Listen carefully and ask questions
            that won't give you away. Try to figure out where everyone is.
          </div>
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-xs uppercase tracking-widest text-ink/50">
            Location
          </div>
          <div className="text-3xl font-black">{round.myLocation}</div>
          {round.myLocationRole && (
            <>
              <div className="mt-2 text-xs uppercase tracking-widest text-ink/50">
                Your role
              </div>
              <div className="text-xl font-semibold">{round.myLocationRole}</div>
            </>
          )}
          <div className="mt-2 text-sm text-ink/60">
            One of the players is the spy and doesn't know the location. Ask
            questions that confirm you're in the know — without giving the
            location away.
          </div>
        </div>
      )}

      <div className="text-center text-xs text-ink/40">
        Discussion starts when the timer runs out…
      </div>
    </div>
  );
}
