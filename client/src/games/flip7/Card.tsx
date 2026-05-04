import type { Flip7Modifier } from "../../../../shared/types";

export function NumberCard({
  value,
  busted,
}: {
  value: number;
  busted?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex h-7 w-7 items-center justify-center rounded-md border text-sm font-bold tabular-nums",
        busted
          ? "border-danger/50 bg-danger/10 text-danger line-through"
          : "border-ink/15 bg-white text-ink",
      ].join(" ")}
    >
      {value}
    </span>
  );
}

export function ModifierChip({ modifier }: { modifier: Flip7Modifier }) {
  const isMul = modifier === "x2";
  return (
    <span
      className={[
        "inline-flex h-7 items-center rounded-md border px-1.5 text-xs font-bold",
        isMul
          ? "border-purple-300 bg-purple-50 text-purple-700"
          : "border-emerald-300 bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {modifier}
    </span>
  );
}

export function SecondChanceBadge() {
  return (
    <span
      title="Second Chance"
      className="inline-flex h-7 items-center rounded-md border border-amber-300 bg-amber-50 px-1.5 text-xs font-bold text-amber-700"
    >
      🛡 SC
    </span>
  );
}
