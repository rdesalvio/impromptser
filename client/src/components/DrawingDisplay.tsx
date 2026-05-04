import { useEffect, useRef } from "react";
import type { DrawingStroke } from "../../../shared/types";

const LOGICAL_SIZE = 600;

export function DrawingDisplay({
  strokes,
  size = LOGICAL_SIZE,
  className,
}: {
  strokes: DrawingStroke[];
  size?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = LOGICAL_SIZE * dpr;
    canvas.height = LOGICAL_SIZE * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
    for (const s of strokes) {
      if (s.points.length === 0) continue;
      if (s.points.length === 1) {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.points[0].x, s.points[0].y, s.width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
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
  }, [strokes]);

  return (
    <canvas
      ref={canvasRef}
      className={[
        "block rounded-lg border border-ink/15 bg-white",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size, maxWidth: "100%", aspectRatio: "1 / 1" }}
    />
  );
}
