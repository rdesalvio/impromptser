import { useRef, useState } from "react";
import type { AppSocket } from "../../socket";
import type { RoomStatePublic } from "../../../../shared/types";
import { DrawingCanvas, DrawingCanvasHandle, DrawingStroke } from "../../components/DrawingCanvas";
import { Timer } from "../../components/Timer";

const COLORS = [
  "#111111",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ffffff",
];

export function TeekoDrawing({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.teekoRound!;
  const draw = round.drawing!;
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const me = state.players.find((p) => p.id === state.myId);
  const isSpectator = me?.isSpectator ?? false;

  function submit() {
    if (isSpectator || strokes.length === 0) return;
    socket.emit("teeko:submit-drawing", { strokes });
    canvasRef.current?.clear();
  }

  const reachedTarget = draw.mySubmitted >= draw.target;

  if (isSpectator) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-3">
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
            Drawing phase
          </div>
          <Timer endsAt={round.phaseEndsAt} />
        </div>
        <div className="card flex flex-col items-center gap-2 py-8 text-center">
          <div className="text-3xl">👁️</div>
          <div className="font-semibold">Spectating</div>
          <div className="text-sm text-ink/60">
            Players are drawing logos. You'll join in the next match.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-3">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
          Draw a logo
        </div>
        <Timer endsAt={round.phaseEndsAt} />
      </div>

      <div className="rounded-xl bg-ink/5 px-3 py-2 text-center text-xs text-ink/70">
        Submitted: <span className="font-semibold text-ink">{draw.mySubmitted}</span> /{" "}
        {draw.target} {reachedTarget && <span className="text-emerald-600">— bonus, keep going!</span>}
      </div>

      <DrawingCanvas ref={canvasRef} color={color} onChange={setStrokes} />

      <div className="flex flex-wrap items-center justify-center gap-2">
        {COLORS.map((c) => {
          const selected = c === color;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
              className={[
                "h-9 w-9 rounded-full border-2 transition",
                selected ? "border-ink scale-110" : "border-ink/20",
              ].join(" ")}
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          className="btn-secondary flex-1"
          onClick={() => canvasRef.current?.undo()}
          disabled={strokes.length === 0}
        >
          Undo
        </button>
        <button
          className="btn-secondary flex-1"
          onClick={() => canvasRef.current?.clear()}
          disabled={strokes.length === 0}
        >
          Clear
        </button>
        <button
          className="btn-primary flex-1"
          onClick={submit}
          disabled={strokes.length === 0}
        >
          Submit logo
        </button>
      </div>
    </div>
  );
}
