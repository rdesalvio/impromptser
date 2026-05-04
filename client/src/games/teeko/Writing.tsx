import { useState } from "react";
import type { AppSocket } from "../../socket";
import type { RoomStatePublic } from "../../../../shared/types";
import { MAX_SLOGAN_LEN } from "../../../../shared/types";
import { Timer } from "../../components/Timer";

export function TeekoWriting({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.teekoRound!;
  const writing = round.writing!;
  const [text, setText] = useState("");

  function submit() {
    const t = text.trim();
    if (!t) return;
    socket.emit("teeko:submit-slogan", { text: t });
    setText("");
  }

  const reachedTarget = writing.mySubmitted >= writing.target;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
          Write a slogan
        </div>
        <Timer endsAt={round.phaseEndsAt} />
      </div>

      <div className="rounded-xl bg-ink/5 px-3 py-2 text-center text-xs text-ink/70">
        Submitted: <span className="font-semibold text-ink">{writing.mySubmitted}</span> /{" "}
        {writing.target} {reachedTarget && <span className="text-emerald-600">— bonus, keep going!</span>}
      </div>

      <div className="card flex flex-col gap-3">
        <input
          className="input"
          maxLength={MAX_SLOGAN_LEN}
          placeholder="Type a slogan…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
        <div className="flex items-center justify-between text-xs text-ink/40">
          <span>{text.length}/{MAX_SLOGAN_LEN}</span>
        </div>
        <button className="btn-primary" onClick={submit} disabled={!text.trim()}>
          Submit slogan
        </button>
      </div>

      {writing.mySlogans.length > 0 && (
        <div className="card">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
            Your slogans so far
          </div>
          <ul className="flex flex-col gap-1">
            {writing.mySlogans.map((s, i) => (
              <li
                key={i}
                className="rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink/80"
              >
                "{s}"
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
