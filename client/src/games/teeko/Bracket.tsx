import type { AppSocket } from "../../socket";
import type { RoomStatePublic, TeekoShirtPublic } from "../../../../shared/types";
import { DrawingDisplay } from "../../components/DrawingDisplay";
import { Timer } from "../../components/Timer";

export function TeekoBracket({
  state,
  socket,
}: {
  state: RoomStatePublic;
  socket: AppSocket;
}) {
  const round = state.teekoRound!;
  const bracket = round.bracket!;
  const matchup = bracket.matchup;

  function vote(side: "LEFT" | "RIGHT") {
    if (matchup.revealed) return;
    socket.emit("teeko:vote", { side });
  }

  // Bye
  if (matchup.byeShirt) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
        <BracketHeader bracket={bracket} phaseEndsAt={round.phaseEndsAt} />
        <div className="card flex flex-col items-center gap-2 py-4 text-center">
          <div className="text-xs uppercase tracking-widest text-ink/50">
            Bye — auto-advance
          </div>
        </div>
        <ShirtCard shirt={matchup.byeShirt} label="Advances" highlight />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <BracketHeader bracket={bracket} phaseEndsAt={round.phaseEndsAt} />

      {matchup.leftShirt && (
        <ShirtChoice
          shirt={matchup.leftShirt}
          label="A"
          revealed={matchup.revealed}
          isWinner={matchup.winner === "LEFT"}
          isMyVote={matchup.myVote === "LEFT"}
          voteCount={matchup.leftVotes}
          onVote={() => vote("LEFT")}
        />
      )}

      <div className="text-center text-xs font-bold uppercase tracking-widest text-ink/40">
        — vs —
      </div>

      {matchup.rightShirt && (
        <ShirtChoice
          shirt={matchup.rightShirt}
          label="B"
          revealed={matchup.revealed}
          isWinner={matchup.winner === "RIGHT"}
          isMyVote={matchup.myVote === "RIGHT"}
          voteCount={matchup.rightVotes}
          onVote={() => vote("RIGHT")}
        />
      )}

      {matchup.revealed && (
        <div className="card text-center text-sm font-semibold">
          Winner: <span className="text-accent">{matchup.winner === "LEFT" ? "A" : "B"}</span>
        </div>
      )}
    </div>
  );
}

function BracketHeader({
  bracket,
  phaseEndsAt,
}: {
  bracket: NonNullable<RoomStatePublic["teekoRound"]>["bracket"];
  phaseEndsAt: number;
}) {
  if (!bracket) return null;
  return (
    <div className="flex items-center justify-between pt-2">
      <div className="text-xs font-bold uppercase tracking-wider text-ink/50">
        Round {bracket.currentRound}/{bracket.totalRounds}
        {" · "}
        Match {bracket.matchupIndex}/{bracket.matchupsInRound}
      </div>
      <Timer endsAt={phaseEndsAt} />
    </div>
  );
}

function ShirtCard({
  shirt,
  label,
  highlight,
}: {
  shirt: TeekoShirtPublic;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "card flex flex-col gap-2",
        highlight ? "border-amber-400 bg-amber-50" : "",
      ].join(" ")}
    >
      <div className="text-xs font-bold uppercase tracking-widest text-ink/50">
        {label}
      </div>
      <DrawingDisplay strokes={shirt.drawing.strokes} size={260} />
      <div className="rounded-lg bg-ink/5 px-3 py-2 text-center text-base font-semibold">
        "{shirt.slogan.text}"
      </div>
    </div>
  );
}

function ShirtChoice({
  shirt,
  label,
  revealed,
  isWinner,
  isMyVote,
  voteCount,
  onVote,
}: {
  shirt: TeekoShirtPublic;
  label: string;
  revealed: boolean;
  isWinner: boolean;
  isMyVote: boolean;
  voteCount?: number;
  onVote: () => void;
}) {
  const border = revealed
    ? isWinner
      ? "border-emerald-400 bg-emerald-50"
      : "border-ink/10 bg-white opacity-70"
    : isMyVote
      ? "border-accent bg-accent/5"
      : "border-ink/15 bg-white";
  return (
    <div className={`card flex flex-col gap-2 ${border}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-ink/50">
          {label}
          {isMyVote && !revealed && (
            <span className="ml-2 text-accent">· your vote</span>
          )}
        </div>
        {revealed && voteCount !== undefined && (
          <div className="text-xs font-semibold tabular-nums text-ink/70">
            {voteCount} vote{voteCount === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <DrawingDisplay strokes={shirt.drawing.strokes} size={260} />
      <div className="rounded-lg bg-ink/5 px-3 py-2 text-center text-base font-semibold">
        "{shirt.slogan.text}"
      </div>
      {!revealed && (
        <button
          className={isMyVote ? "btn-primary" : "btn-secondary"}
          onClick={onVote}
        >
          {isMyVote ? "Voted" : `Vote ${label}`}
        </button>
      )}
    </div>
  );
}
