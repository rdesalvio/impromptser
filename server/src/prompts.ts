export const PROMPTS: { id: string; text: string }[] = [
  { id: "beach-item", text: "What is an item you would bring to the beach?" },
];

export function pickRandomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}
