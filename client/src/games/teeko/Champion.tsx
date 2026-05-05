import { useEffect } from "react";
import type { AppSocket } from "../../socket";
import type { RoomStatePublic } from "../../../../shared/types";
import { DrawingDisplay } from "../../components/DrawingDisplay";
import { sounds } from "../../sounds";

export function TeekoChampion({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.teekoRound!;
  const champion = round.champion!;
  const isHost = state.myId === state.hostId;
  const playerName = (id: string) =>
    state.players.find((p) => p.id === id)?.name ?? "?";
  const composer = playerName(champion.composerId);
  const drawingAuthor = playerName(champion.drawingAuthorId);
  const sloganAuthor = playerName(champion.sloganAuthorId);

  useEffect(() => {
    sounds.win();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4">
      <div className="card flex flex-col items-center gap-2 border-amber-400 bg-amber-50 py-6 text-center dark:border-amber-600 dark:bg-amber-900/30">
        <div className="text-4xl">🏆</div>
        <div className="text-xl font-black">CHAMPION SHIRT</div>
        <DrawingDisplay strokes={champion.shirt.drawing.strokes} size={300} />
        <div className="rounded-lg bg-surface px-3 py-2 text-lg font-semibold">
          "{champion.shirt.slogan.text}"
        </div>
      </div>

      <div className="card text-center text-sm text-ink/80">
        <div className="mb-1 text-xs uppercase tracking-widest text-ink/50">
          Credits
        </div>
        <div>
          Composed by <span className="font-semibold">{composer}</span>
        </div>
        <div>
          Drawing by <span className="font-semibold">{drawingAuthor}</span>
        </div>
        <div>
          Slogan by <span className="font-semibold">{sloganAuthor}</span>
        </div>
      </div>

      {isHost ? (
        <button
          className="btn-primary"
          onClick={() => socket.emit("teeko:next-game")}
        >
          Play again
        </button>
      ) : (
        <div className="text-center text-sm text-ink/50">
          Waiting for host to start a new game…
        </div>
      )}
    </div>
  );
}
