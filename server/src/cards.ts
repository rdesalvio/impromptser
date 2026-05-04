import type { Flip7Card, Flip7Modifier } from "../../shared/types.ts";

export function buildDeck(): Flip7Card[] {
  const deck: Flip7Card[] = [];
  // Number cards: count = value (one 1, two 2s, ... twelve 12s) + a single 0.
  deck.push({ kind: "number", value: 0 });
  for (let v = 1; v <= 12; v++) {
    for (let i = 0; i < v; i++) deck.push({ kind: "number", value: v });
  }
  const modifiers: Flip7Modifier[] = ["+2", "+4", "+6", "+8", "+10", "x2"];
  for (const m of modifiers) deck.push({ kind: "modifier", modifier: m });
  for (let i = 0; i < 3; i++) {
    deck.push({ kind: "action", action: "FREEZE" });
    deck.push({ kind: "action", action: "FLIP3" });
    deck.push({ kind: "action", action: "SECOND_CHANCE" });
  }
  return deck;
}

export function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
