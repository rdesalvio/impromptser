// Web Audio synthesized sound effects. No external assets — every sound is
// generated from oscillators on the fly. Toggleable + persisted via localStorage.
//
// Usage:
//   sounds.yourTurn()     — short rising chime
//   sounds.bust()         — descending sad sound
//   sounds.flipSeven()    — celebratory ascending fanfare
//   sounds.win()          — short triumphant chord
//   sounds.lose()         — descending defeated tone
//   sounds.click()        — quick blip (e.g. vote cast)

const STORAGE_KEY = "impromptser:sound-on";

let ctx: AudioContext | null = null;
let enabled = readEnabled();
const listeners = new Set<(on: boolean) => void>();

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
  if (on) ensureCtx(); // unlock audio context on user gesture
  for (const l of listeners) l(on);
}

export function subscribeSound(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface Note {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

function play(notes: Note[]): void {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime;
  for (const n of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.type ?? "triangle";
    osc.frequency.value = n.freq;
    const gain = n.gain ?? 0.2;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, t0 + n.at + 0.008);
    g.gain.linearRampToValueAtTime(0, t0 + n.at + n.dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.05);
  }
}

export const sounds = {
  yourTurn: () => play([
    { freq: 523.25, at: 0, dur: 0.1 },        // C5
    { freq: 659.25, at: 0.1, dur: 0.15 },     // E5
  ]),
  bust: () => play([
    { freq: 311.13, at: 0, dur: 0.15, type: "sawtooth", gain: 0.15 },  // Eb4
    { freq: 207.65, at: 0.15, dur: 0.3, type: "sawtooth", gain: 0.15 }, // Ab3
  ]),
  flipSeven: () => play([
    { freq: 523.25, at: 0, dur: 0.09 },       // C5
    { freq: 659.25, at: 0.1, dur: 0.09 },     // E5
    { freq: 783.99, at: 0.2, dur: 0.09 },     // G5
    { freq: 1046.5, at: 0.3, dur: 0.35 },     // C6
  ]),
  win: () => play([
    { freq: 523.25, at: 0, dur: 0.12 },
    { freq: 783.99, at: 0.12, dur: 0.12 },
    { freq: 1046.5, at: 0.24, dur: 0.35 },
  ]),
  lose: () => play([
    { freq: 392.0, at: 0, dur: 0.15, type: "sawtooth", gain: 0.15 },  // G4
    { freq: 329.63, at: 0.15, dur: 0.15, type: "sawtooth", gain: 0.15 }, // E4
    { freq: 261.63, at: 0.3, dur: 0.4, type: "sawtooth", gain: 0.15 },   // C4
  ]),
  click: () => play([{ freq: 800, at: 0, dur: 0.05, type: "square", gain: 0.08 }]),
};
