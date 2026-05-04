import { useState } from "react";
import type { AppSocket } from "../socket";
import type { RoomStatePublic } from "../../../shared/types";
import { MAX_ANSWER_LEN } from "../../../shared/types";
import { Timer } from "../components/Timer";

export function ImposterAnswering({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.imposterRound!;
  const [text, setText] = useState("");
  const isImposter = round.myRole === "IMPOSTER";

  if (!isImposter) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
        <div className="flex items-center justify-between pt-4">
          <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
            Imposter is answering…
          </div>
          <Timer endsAt={round.phaseEndsAt} />
        </div>
        <div className="card text-center">
          <div className="text-5xl">⏳</div>
          <div className="mt-2 font-semibold">Hang tight</div>
          <div className="text-sm text-ink/60">
            The imposter is making up an answer. Voting starts soon.
          </div>
        </div>
      </div>
    );
  }

  function submit() {
    if (!text.trim() || round.iSubmittedAnswer) return;
    socket.emit("answer:submit", { text: text.trim() });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between pt-4">
        <div className="rounded-full bg-danger/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-danger">
          Blend in
        </div>
        <Timer endsAt={round.phaseEndsAt} />
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-widest text-ink/40">
          Other answers
        </div>
        <ul className="mt-2 flex flex-col gap-2">
          {round.answers.map((a, i) => (
            <li
              key={i}
              className="rounded-xl bg-ink/5 px-3 py-2 text-base"
            >
              {a.text}
            </li>
          ))}
        </ul>
      </div>

      {round.iSubmittedAnswer ? (
        <div className="card flex flex-col items-center gap-2 text-center">
          <div className="text-3xl">✓</div>
          <div className="font-semibold">Submitted</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            className="input"
            maxLength={MAX_ANSWER_LEN}
            placeholder="Write a fitting answer…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
          <div className="text-right text-xs text-ink/40">
            {text.length}/{MAX_ANSWER_LEN}
          </div>
          <button className="btn-primary" onClick={submit} disabled={!text.trim()}>
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
