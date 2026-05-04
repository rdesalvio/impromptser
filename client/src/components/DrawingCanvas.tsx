import {
  PointerEvent as ReactPointerEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface DrawingStroke {
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export interface DrawingCanvasHandle {
  clear: () => void;
  undo: () => void;
  getStrokes: () => DrawingStroke[];
}

const DEFAULT_BRUSH = 4;

export const DrawingCanvas = forwardRef<
  DrawingCanvasHandle,
  {
    color: string;
    width?: number;
    height?: number;
    onChange?: (strokes: DrawingStroke[]) => void;
  }
>(function DrawingCanvas({ color, width = 600, height = 600, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokesRef = useRef<DrawingStroke[]>([]);
  const currentRef = useRef<DrawingStroke | null>(null);
  const [, setRevision] = useState(0);

  // One-time canvas init: set bitmap size + scale for high-DPI. Display size is
  // controlled entirely by CSS (style prop below), so the canvas can shrink to fit
  // a mobile viewport without bleeding off the right edge.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
    redrawAll();
  }, [width, height]);

  function redrawAll() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    for (const s of strokesRef.current) drawStroke(ctx, s);
  }

  useImperativeHandle(ref, () => ({
    clear: () => {
      strokesRef.current = [];
      currentRef.current = null;
      redrawAll();
      setRevision((r) => r + 1);
      onChange?.(strokesRef.current);
    },
    undo: () => {
      strokesRef.current = strokesRef.current.slice(0, -1);
      redrawAll();
      setRevision((r) => r + 1);
      onChange?.(strokesRef.current);
    },
    getStrokes: () => strokesRef.current,
  }));

  function localCoords(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * width) / rect.width,
      y: ((e.clientY - rect.top) * height) / rect.height,
    };
  }

  function pointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.button !== undefined && e.button !== 0) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = localCoords(e);
    currentRef.current = { color, width: DEFAULT_BRUSH, points: [p] };
  }

  function pointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const cur = currentRef.current;
    if (!cur) return;
    const p = localCoords(e);
    cur.points.push(p);
    // Draw the new segment incrementally for responsiveness.
    const ctx = ctxRef.current;
    if (ctx && cur.points.length >= 2) {
      const a = cur.points[cur.points.length - 2];
      const b = cur.points[cur.points.length - 1];
      ctx.strokeStyle = cur.color;
      ctx.lineWidth = cur.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function pointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    const cur = currentRef.current;
    if (!cur) return;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    // A tap with no drag still produces a single-point "dot" — render it.
    if (cur.points.length === 1) {
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.fillStyle = cur.color;
        ctx.beginPath();
        ctx.arc(cur.points[0].x, cur.points[0].y, cur.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    strokesRef.current = [...strokesRef.current, cur];
    currentRef.current = null;
    setRevision((r) => r + 1);
    onChange?.(strokesRef.current);
  }

  return (
    <canvas
      ref={canvasRef}
      className="touch-none select-none rounded-xl border-2 border-ink/15 bg-white shadow-inner"
      style={{
        // Display sizing: fit container, square aspect.
        width: "100%",
        maxWidth: width,
        aspectRatio: `${width} / ${height}`,
        touchAction: "none",
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    />
  );
});

function drawStroke(ctx: CanvasRenderingContext2D, s: DrawingStroke) {
  if (s.points.length === 0) return;
  if (s.points.length === 1) {
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.points[0].x, s.points[0].y, s.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineTo(s.points[i].x, s.points[i].y);
  }
  ctx.stroke();
}
