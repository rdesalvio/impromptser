import type { AppSocket } from "../../socket";
import type { RoomStatePublic } from "../../../../shared/types";
import { ChatPanel } from "../../components/ChatPanel";

export function Flip7GameOver({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.flip7Round!;
  const isHost = state.myId === state.hostId;
  const players = [...state.players].sort((a, b) => b.score - a.score);
  const winner = players.find((p) => p.id === round.gameWinnerId);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-44">
      <div className="card flex flex-col items-center gap-2 border-amber-300 bg-amber-50 py-8 text-center dark:border-amber-600 dark:bg-amber-900/30">
        <div className="text-5xl">🏆</div>
        <div className="text-2xl font-black">{winner?.name ?? "?"} wins!</div>
        <div className="text-sm text-ink/60">
          First to {round.targetScore} after {round.roundNumber} round
          {round.roundNumber === 1 ? "" : "s"}.
        </div>
      </div>

      <div className="card">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
          Final standings
        </div>
        <ul className="flex flex-col divide-y divide-ink/5">
          {players.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="w-5 text-sm font-bold tabular-nums text-ink/40">
                  {i + 1}
                </span>
                <span className="font-medium">{p.name}</span>
                {p.id === round.gameWinnerId && (
                  <span className="text-amber-600">🏆</span>
                )}
              </div>
              <span className="text-sm font-semibold tabular-nums">{p.score}</span>
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <button
          className="btn-primary"
          onClick={() => socket.emit("flip7:next-game")}
        >
          Play again
        </button>
      ) : (
        <div className="text-center text-sm text-ink/50">
          Waiting for host to start a new game…
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-ink/10 bg-paper/95 px-3 pb-2 pt-2 backdrop-blur">
        <ChatPanel
          messages={round.chat}
          socket={socket}
          players={state.players}
          hideHeader
          listClassName="max-h-24 min-h-[2.5rem]"
          emptyPlaceholder="Recap the game…"
        />
      </div>
    </div>
  );
}
