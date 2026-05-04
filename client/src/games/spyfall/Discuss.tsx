import { useEffect, useRef, useState } from "react";
import type { AppSocket } from "../../socket";
import type { RoomStatePublic } from "../../../../shared/types";
import { MAX_CHAT_LEN } from "../../../../shared/types";
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
  const [chatText, setChatText] = useState("");
  const [showLocations, setShowLocations] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [round.chat.length]);

  function sendChat() {
    const t = chatText.trim();
    if (!t) return;
    socket.emit("chat:send", { text: t });
    setChatText("");
  }

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
            : "border-ink/10 bg-white",
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
            className="rounded-lg border border-danger/30 bg-white px-2 py-1 text-xs font-medium text-danger"
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

      <div className="card flex flex-1 flex-col gap-2">
        <div className="text-xs font-medium text-ink/60">Discussion</div>
        <div
          ref={chatRef}
          className="max-h-[40vh] min-h-[12rem] flex-1 overflow-y-auto rounded-xl bg-ink/5 p-2"
        >
          {round.chat.length === 0 ? (
            <div className="px-1 py-2 text-center text-xs text-ink/40">
              Start asking questions to root out the spy…
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {round.chat.map((m) => (
                <li key={m.id} className="text-sm">
                  <span className="font-semibold">{m.playerName}:</span>{" "}
                  <span>{m.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Ask a question…"
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

      <button className="btn-primary" onClick={callVote}>
        Call vote
      </button>
    </div>
  );
}
