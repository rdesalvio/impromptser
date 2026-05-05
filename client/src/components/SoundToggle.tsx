import { useEffect, useState } from "react";
import { isSoundEnabled, setSoundEnabled, sounds, subscribeSound } from "../sounds";

export function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled);

  useEffect(() => subscribeSound(setOn), []);

  function toggle() {
    const next = !on;
    setSoundEnabled(next);
    if (next) {
      // Confirm activation with a short blip — also unlocks audio on iOS Safari.
      sounds.click();
    }
  }

  return (
    <button
      type="button"
      aria-label={on ? "Mute sounds" : "Enable sounds"}
      onClick={toggle}
      className="fixed left-14 top-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-surface text-ink/70 shadow-sm transition hover:text-ink"
    >
      {on ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      )}
    </button>
  );
}
