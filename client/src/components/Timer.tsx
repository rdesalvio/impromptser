import { useEffect, useState } from "react";

export function Timer({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const tone = remaining <= 5 ? "text-danger" : "text-ink/60";
  return (
    <div className={`text-sm font-semibold tabular-nums ${tone}`}>
      {remaining}s
    </div>
  );
}
