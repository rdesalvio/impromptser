import type { Flip7Hand, Player } from "../../../../shared/types";
import { ModifierChip, NumberCard, SecondChanceBadge } from "./Card";

const STATUS_LABEL: Record<Flip7Hand["status"], string> = {
  ACTIVE: "",
  STAYED: "STAYED",
  FROZEN: "FROZEN",
  BUSTED: "BUSTED",
  FLIPPED_SEVEN: "FLIP 7!",
};

const STATUS_BADGE_CLASS: Record<Flip7Hand["status"], string> = {
  ACTIVE: "",
  STAYED: "bg-ink/10 text-ink/60",
  FROZEN: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  BUSTED: "bg-danger/10 text-danger",
  FLIPPED_SEVEN: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
};

export function PlayerRow({
  player,
  hand,
  isCurrent,
  isMe,
  isTargetable,
  onTarget,
  isForcedDrawer,
}: {
  player: Player;
  hand: Flip7Hand;
  isCurrent: boolean;
  isMe: boolean;
  isTargetable: boolean;
  onTarget?: () => void;
  isForcedDrawer: boolean;
}) {
  const dim = hand.status === "BUSTED" || hand.status === "FROZEN";
  const wrapperClass = [
    "block w-full rounded-2xl border px-3 py-2 text-left transition",
    isTargetable
      ? "cursor-pointer border-dashed border-accent bg-accent/5 hover:bg-accent/10"
      : isCurrent
        ? "border-accent bg-accent/5"
        : isForcedDrawer
          ? "border-purple-300 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/30"
          : "border-ink/10 bg-surface",
    dim ? "opacity-70" : "",
  ].join(" ");

  return (
    <button
      type="button"
      disabled={!isTargetable}
      onClick={isTargetable ? onTarget : undefined}
      className={wrapperClass}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isCurrent && <span className="text-accent">▶</span>}
          {isForcedDrawer && <span className="text-purple-600">⚡</span>}
          <span className="truncate font-semibold">
            {player.name}
            {isMe && <span className="ml-1 text-xs font-normal text-ink/40">(you)</span>}
          </span>
          {hand.status !== "ACTIVE" && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_BADGE_CLASS[hand.status]}`}
            >
              {STATUS_LABEL[hand.status]}
              {hand.status === "BUSTED" && hand.bustedOn !== undefined && (
                <span className="ml-1 font-normal opacity-80">on {hand.bustedOn}</span>
              )}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums text-ink/70">
          <span className="mr-2">Hand <span className="font-semibold text-ink">{hand.roundScore}</span></span>
          <span>Total <span className="font-semibold text-ink">{player.score}</span></span>
        </div>
      </div>
      {(hand.numbers.length > 0 || hand.modifiers.length > 0 || hand.hasSecondChance) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {hand.numbers.map((n, i) => (
            <NumberCard key={`n-${i}`} value={n} busted={hand.status === "BUSTED"} />
          ))}
          {hand.modifiers.map((m, i) => (
            <ModifierChip key={`m-${i}`} modifier={m} />
          ))}
          {hand.hasSecondChance && <SecondChanceBadge />}
        </div>
      )}
    </button>
  );
}
