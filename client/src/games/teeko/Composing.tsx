import { useState } from "react";
import type { AppSocket } from "../../socket";
import type { RoomStatePublic } from "../../../../shared/types";
import { TEEKO_SHIRTS_PER_PLAYER } from "../../../../shared/types";
import { DrawingDisplay } from "../../components/DrawingDisplay";
import { Timer } from "../../components/Timer";

type ShirtDraft = { drawingId?: string; sloganId?: string };

export function TeekoComposing({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.teekoRound!;
  const composing = round.composing!;

  const [shirts, setShirts] = useState<ShirtDraft[]>(() =>
    Array(TEEKO_SHIRTS_PER_PLAYER)
      .fill(null)
      .map(() => ({}))
  );
  const [selected, setSelected] = useState<
    { kind: "drawing"; id: string } | { kind: "slogan"; id: string } | null
  >(null);

  if (!composing.myHand) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-6 text-center">
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
            Composing
          </div>
          <Timer endsAt={round.phaseEndsAt} />
        </div>
        <div className="card flex flex-col items-center gap-2 py-8">
          <div className="text-3xl">👀</div>
          <div className="font-semibold">You didn't submit a logo</div>
          <div className="text-sm text-ink/60">
            You'll vote on others' shirts in the bracket — sit tight while
            other players build theirs.
          </div>
          <div className="mt-2 text-xs text-ink/50">
            {composing.progress.submitted}/{composing.progress.total} composed
          </div>
        </div>
      </div>
    );
  }

  const usedDrawingIds = new Set(
    shirts.map((s) => s.drawingId).filter((id): id is string => Boolean(id))
  );
  const usedSloganIds = new Set(
    shirts.map((s) => s.sloganId).filter((id): id is string => Boolean(id))
  );

  function assignToShirt(shirtIndex: number) {
    if (!selected) return;
    setShirts((prev) => {
      const next = prev.map((s) => ({ ...s }));
      if (selected.kind === "drawing") next[shirtIndex].drawingId = selected.id;
      else next[shirtIndex].sloganId = selected.id;
      return next;
    });
    setSelected(null);
  }

  function clearSlot(shirtIndex: number, kind: "drawing" | "slogan") {
    setShirts((prev) => {
      const next = prev.map((s) => ({ ...s }));
      if (kind === "drawing") delete next[shirtIndex].drawingId;
      else delete next[shirtIndex].sloganId;
      return next;
    });
  }

  function submit() {
    const ready = shirts.every((s) => s.drawingId && s.sloganId);
    if (!ready) return;
    socket.emit("teeko:submit-shirts", {
      shirts: shirts.map((s) => ({
        drawingId: s.drawingId!,
        sloganId: s.sloganId!,
      })),
    });
  }

  const allFilled = shirts.every((s) => s.drawingId && s.sloganId);

  if (composing.submitted) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-6">
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
            Composing
          </div>
          <Timer endsAt={round.phaseEndsAt} />
        </div>
        <div className="card flex flex-col items-center gap-2 py-8 text-center">
          <div className="text-3xl">✓</div>
          <div className="font-semibold">Shirts submitted</div>
          <div className="text-sm text-ink/60">
            Waiting for other players… {composing.progress.submitted}/
            {composing.progress.total} done
          </div>
        </div>
      </div>
    );
  }

  const drawingById = Object.fromEntries(
    composing.myHand.drawings.map((d) => [d.id, d])
  );
  const sloganById = Object.fromEntries(
    composing.myHand.slogans.map((s) => [s.id, s])
  );

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-3">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
          Build your t-shirts
        </div>
        <Timer endsAt={round.phaseEndsAt} />
      </div>

      {/* Shirt slots */}
      <div className="grid grid-cols-2 gap-2">
        {shirts.map((shirt, i) => {
          const drawing = shirt.drawingId ? drawingById[shirt.drawingId] : null;
          const slogan = shirt.sloganId ? sloganById[shirt.sloganId] : null;
          const acceptingDrawing = selected?.kind === "drawing" && !shirt.drawingId;
          const acceptingSlogan = selected?.kind === "slogan" && !shirt.sloganId;
          const accepting = acceptingDrawing || acceptingSlogan;
          return (
            <div
              key={i}
              className={[
                "card flex flex-col gap-2 p-3 transition",
                accepting ? "border-accent ring-2 ring-accent" : "",
              ].join(" ")}
            >
              <div className="text-xs font-semibold uppercase tracking-widest text-ink/50">
                Shirt {i + 1}
              </div>
              {/* Drawing slot */}
              {drawing ? (
                <button
                  onClick={() => clearSlot(i, "drawing")}
                  className="block w-full"
                  title="Tap to clear"
                >
                  <DrawingDisplay strokes={drawing.strokes} size={140} />
                </button>
              ) : (
                <button
                  onClick={() => acceptingDrawing && assignToShirt(i)}
                  className={[
                    "flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed text-xs",
                    acceptingDrawing
                      ? "border-accent bg-accent/5 text-accent"
                      : "border-ink/20 text-ink/40",
                  ].join(" ")}
                >
                  {acceptingDrawing ? "Tap to add drawing" : "no drawing"}
                </button>
              )}
              {/* Slogan slot */}
              {slogan ? (
                <button
                  onClick={() => clearSlot(i, "slogan")}
                  className="block w-full rounded-lg bg-ink/5 px-2 py-2 text-center text-xs font-medium text-ink/80"
                  title="Tap to clear"
                >
                  "{slogan.text}"
                </button>
              ) : (
                <button
                  onClick={() => acceptingSlogan && assignToShirt(i)}
                  className={[
                    "rounded-lg border-2 border-dashed py-2 text-center text-xs",
                    acceptingSlogan
                      ? "border-accent bg-accent/5 text-accent"
                      : "border-ink/20 text-ink/40",
                  ].join(" ")}
                >
                  {acceptingSlogan ? "Tap to add slogan" : "no slogan"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Hand: drawings */}
      <div className="card">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
          Your drawings
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {composing.myHand.drawings.map((d) => {
            const used = usedDrawingIds.has(d.id);
            const isSelected = selected?.kind === "drawing" && selected.id === d.id;
            return (
              <button
                key={d.id}
                disabled={used}
                onClick={() =>
                  setSelected(isSelected ? null : { kind: "drawing", id: d.id })
                }
                className={[
                  "rounded-lg border-2 p-1 transition",
                  used
                    ? "border-emerald-300 opacity-40"
                    : isSelected
                      ? "border-accent ring-2 ring-accent"
                      : "border-ink/15 hover:border-accent/40",
                ].join(" ")}
              >
                <DrawingDisplay strokes={d.strokes} size={110} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Hand: slogans */}
      <div className="card">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
          Your slogans
        </div>
        <div className="flex flex-col gap-1">
          {composing.myHand.slogans.map((s) => {
            const used = usedSloganIds.has(s.id);
            const isSelected = selected?.kind === "slogan" && selected.id === s.id;
            return (
              <button
                key={s.id}
                disabled={used}
                onClick={() =>
                  setSelected(isSelected ? null : { kind: "slogan", id: s.id })
                }
                className={[
                  "rounded-lg border-2 px-3 py-2 text-left text-sm transition",
                  used
                    ? "border-emerald-300 opacity-40"
                    : isSelected
                      ? "border-accent bg-accent/5"
                      : "border-ink/15 hover:border-accent/40",
                ].join(" ")}
              >
                "{s.text}"
              </button>
            );
          })}
        </div>
      </div>

      <button
        className="btn-primary"
        disabled={!allFilled}
        onClick={submit}
      >
        {allFilled
          ? "Submit shirts"
          : `Build both shirts to submit (${shirts.filter((s) => s.drawingId && s.sloganId).length}/${shirts.length})`}
      </button>

      <div className="text-center text-xs text-ink/40">
        {composing.progress.submitted}/{composing.progress.total} players done
      </div>
    </div>
  );
}
