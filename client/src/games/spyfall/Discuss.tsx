import { useState } from "react";
import type { AppSocket } from "../../socket";
import type { RoomStatePublic } from "../../../../shared/types";
import { ChatPanel } from "../../components/ChatPanel";
import { Timer } from "../../components/Timer";

export function SpyfallDiscuss({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.spyfallRound!;
  const isSpy = round.myRole === "SPY";
  const [showLocations, setShowLocations] = useState(false);

  function callVote() {
    if (!confirm("End discussion and start voting now?")) return;
    socket.emit("vote:call");
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
          Discuss
        </div>
        <Timer endsAt={round.phaseEndsAt} />
      </div>

      <div
        className={[
          "card flex items-center justify-between gap-3 py-3",
          isSpy
            ? "border-danger/30 bg-danger/5"
            : "border-ink/10 bg-surface",
        ].join(" ")}
      >
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-widest text-ink/40">
            Your card
          </div>
          {isSpy ? (
            <div className="text-base font-bold text-danger">SPY</div>
          ) : (
            <div className="text-base font-semibold">
              {round.myLocation}
              {round.myLocationRole && (
                <span className="ml-2 text-xs font-normal text-ink/50">
                  · {round.myLocationRole}
                </span>
              )}
            </div>
          )}
        </div>
        {isSpy && (
          <button
            onClick={() => setShowLocations((v) => !v)}
            className="rounded-lg border border-danger/30 bg-surface px-2 py-1 text-xs font-medium text-danger"
          >
            {showLocations ? "Hide" : "Locations"}
          </button>
        )}
      </div>

      {isSpy && showLocations && (
        <div className="card">
          <div className="mb-2 text-xs font-medium text-ink/60">
            Possible locations
          </div>
          <div className="grid grid-cols-2 gap-1 text-xs text-ink/70">
            {round.allLocations.map((loc) => (
              <div key={loc} className="truncate">
                · {loc}
              </div>
            ))}
          </div>
        </div>
      )}

      <ChatPanel
        className="card flex-1"
        listClassName="max-h-[40vh] min-h-[12rem]"
        messages={round.chat}
        socket={socket}
        players={state.players}
        emptyPlaceholder="Start asking questions to root out the spy…"
        inputPlaceholder="Ask a question…"
      />

      <button className="btn-primary" onClick={callVote}>
        Call vote
      </button>
    </div>
  );
}
