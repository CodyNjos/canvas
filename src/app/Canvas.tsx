"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useMutation,
  useOthers,
  useStorage,
  useUpdateMyPresence,
  useSelf,
} from "@liveblocks/react/suspense";
import { GRID_WIDTH, GRID_HEIGHT } from "./liveblocks.config";

const BG_COLOR = "#0a0a0c";
const GRID_BG_COLOR = "#1c1c22";
const GRID_LINE_COLOR = "#3d3d4a";
const GRID_BORDER_COLOR = "#e31837";

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [color, setColor] = useState("#e31837");
  const [zoom, setZoom] = useState(4);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });


  const pixels = useStorage((root) => root.pixels);
  const others = useOthers();
  const self = useSelf();
  const updateMyPresence = useUpdateMyPresence();

  // Place a single pixel — LiveMap.set() is a granular CRDT op,
  // so concurrent writes to different keys never overwrite each other.
  const placePixel = useMutation(({ storage }, key: string, color: string) => {
    storage.get("pixels").set(key, color);
  }, []);

  // Clear all pixels
  const clearCanvas = useMutation(({ storage }) => {
    const pixels = storage.get("pixels");
    for (const key of [...pixels.keys()]) {
      pixels.delete(key);
    }
  }, []);

  // Calculate cell size based on zoom
  const cellSize = Math.max(1, Math.round(6 * zoom));

  // Convert screen coords to grid coords
  const screenToGrid = useCallback(
    (screenX: number, screenY: number) => {
      const gx = Math.floor((screenX - offset.x) / cellSize);
      const gy = Math.floor((screenY - offset.y) / cellSize);
      return { gx, gy };
    },
    [offset, cellSize]
  );

  // Redraw the grid
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixels) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Calculate visible grid range
    const startGx = Math.max(0, Math.floor(-offset.x / cellSize));
    const startGy = Math.max(0, Math.floor(-offset.y / cellSize));
    const endGx = Math.min(GRID_WIDTH, Math.ceil((w - offset.x) / cellSize));
    const endGy = Math.min(GRID_HEIGHT, Math.ceil((h - offset.y) / cellSize));

    // Draw grid background (the drawable area)
    const fullGridX = offset.x;
    const fullGridY = offset.y;
    const fullGridW = GRID_WIDTH * cellSize;
    const fullGridH = GRID_HEIGHT * cellSize;

    const gridPixelX = offset.x + startGx * cellSize;
    const gridPixelY = offset.y + startGy * cellSize;
    const gridPixelW = (endGx - startGx) * cellSize;
    const gridPixelH = (endGy - startGy) * cellSize;

    // Grid fill — lighter than page background so it stands out
    ctx.fillStyle = GRID_BG_COLOR;
    ctx.fillRect(gridPixelX, gridPixelY, gridPixelW, gridPixelH);

    // Outer border around the full grid — Scheels red accent
    ctx.strokeStyle = GRID_BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(fullGridX - 1, fullGridY - 1, fullGridW + 2, fullGridH + 2);

    // Subtle outer glow
    ctx.shadowColor = GRID_BORDER_COLOR;
    ctx.shadowBlur = 12;
    ctx.strokeRect(fullGridX - 1, fullGridY - 1, fullGridW + 2, fullGridH + 2);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Draw filled pixels
    for (const [key, pixelColor] of Object.entries(pixels)) {
      if (typeof pixelColor !== "string") continue;

      const [xStr, yStr] = key.split(",");
      const px = parseInt(xStr, 10);
      const py = parseInt(yStr, 10);

      if (px < startGx || px >= endGx || py < startGy || py >= endGy) continue;

      const sx = offset.x + px * cellSize;
      const sy = offset.y + py * cellSize;

      ctx.fillStyle = pixelColor;
      ctx.fillRect(sx, sy, cellSize, cellSize);
    }

    // Draw grid lines when zoomed in enough
    if (cellSize >= 4) {
      ctx.strokeStyle = GRID_LINE_COLOR;
      ctx.lineWidth = cellSize >= 12 ? 1 : 0.5;

      // Vertical lines
      for (let gx = startGx; gx <= endGx; gx++) {
        const sx = offset.x + gx * cellSize;
        ctx.beginPath();
        ctx.moveTo(sx, gridPixelY);
        ctx.lineTo(sx, gridPixelY + gridPixelH);
        ctx.stroke();
      }

      // Horizontal lines
      for (let gy = startGy; gy <= endGy; gy++) {
        const sy = offset.y + gy * cellSize;
        ctx.beginPath();
        ctx.moveTo(gridPixelX, sy);
        ctx.lineTo(gridPixelX + gridPixelW, sy);
        ctx.stroke();
      }
    }

    // Draw hover highlight for local cursor
    // (handled via CSS overlay instead for smoothness)
  }, [pixels, offset, cellSize]);

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redraw();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [redraw]);

  // Redraw when pixels or view changes
  useEffect(() => {
    redraw();
  }, [pixels, redraw]);

  // Center grid on initial load
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const totalW = GRID_WIDTH * cellSize;
    const totalH = GRID_HEIGHT * cellSize;
    setOffset({
      x: Math.round((container.clientWidth - totalW) / 2),
      y: Math.round((container.clientHeight - totalH) / 2),
    });
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { gx, gy } = screenToGrid(sx, sy);

    // Left click inside grid = place pixel
    if (e.button === 0 && gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
      placePixel(`${gx},${gy}`, color);
    }

    // Right click starts pan
    if (e.button === 2) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Update cursor presence (in grid coords)
    const { gx, gy } = screenToGrid(sx, sy);
    if (gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
      updateMyPresence({ cursor: { x: gx, y: gy } });
    } else {
      updateMyPresence({ cursor: null });
    }

    if (isPanning) {
      setOffset({
        x: panStart.current.ox + (e.clientX - panStart.current.x),
        y: panStart.current.oy + (e.clientY - panStart.current.y),
      });
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  const handlePointerLeave = () => {
    updateMyPresence({ cursor: null });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.3, Math.min(15, zoom * zoomFactor));
    const newCellSize = Math.max(1, Math.round(6 * newZoom));
    const oldCellSize = cellSize;

    // Zoom toward mouse position
    const newOffset = {
      x: mouseX - ((mouseX - offset.x) / oldCellSize) * newCellSize,
      y: mouseY - ((mouseY - offset.y) / oldCellSize) * newCellSize,
    };

    setZoom(newZoom);
    setOffset(newOffset);
  };

  // Clear modal state
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearError, setClearError] = useState(false);

  const CLEAR_PASSWORD = "wipe";

  const handleClear = () => {
    setShowClearModal(true);
    setClearPassword("");
    setClearError(false);
  };

  const handleClearSubmit = () => {
    if (clearPassword === CLEAR_PASSWORD) {
      clearCanvas();
      setShowClearModal(false);
    } else {
      setClearError(true);
    }
  };

  const connectionCount = others.length + 1;
  const pixelCount = pixels ? Object.keys(pixels).length : 0;

  const COLOR_PRESETS = [
    "#ffffff", "#e31837", "#ff6b35", "#ffd23f", "#22c55e",
    "#3b82f6", "#8b5cf6", "#ec4899", "#000000", "#6b7280",
    "#f97316", "#a3e635", "#06b6d4", "#c084fc", "#fb7185",
    "#18181c",
  ];

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <div className="flex h-12 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-widest text-scheels-red">
            SCHEELS
          </span>
          <span className="text-[10px] text-muted">|</span>
          <h1 className="text-sm font-medium text-foreground/80">
            Communal Canvas
          </h1>
          <span className="rounded bg-surface-light px-2 py-0.5 text-[10px] text-muted">
            {GRID_WIDTH}x{GRID_HEIGHT}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted">
            {pixelCount.toLocaleString()} pixels placed
          </span>
          <button
            onClick={handleClear}
            className="rounded px-3 py-1 text-xs font-medium text-muted transition-colors hover:bg-scheels-red/10 hover:text-scheels-red"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex w-14 flex-col items-center gap-2 border-r border-border bg-surface py-3">
          {/* Color presets */}
          <div className="flex flex-col items-center gap-1.5">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-sm border-2 transition-transform ${
                  color === c
                    ? "scale-125 border-white"
                    : "border-border hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            {/* Custom color */}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="mt-1 h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
              title="Custom color"
            />
          </div>

          <div className="my-1 h-px w-8 bg-border" />

          {/* Zoom controls */}
          <button
            onClick={() => {
              const newZoom = Math.min(15, zoom * 1.4);
              const canvas = canvasRef.current;
              if (!canvas) return;
              const cx = canvas.width / 2;
              const cy = canvas.height / 2;
              const newCellSize = Math.max(1, Math.round(6 * newZoom));
              setOffset({
                x: cx - ((cx - offset.x) / cellSize) * newCellSize,
                y: cy - ((cy - offset.y) / cellSize) * newCellSize,
              });
              setZoom(newZoom);
            }}
            className="flex h-8 w-8 items-center justify-center rounded text-xs text-muted transition-colors hover:bg-surface-light hover:text-foreground"
            title="Zoom in"
          >
            +
          </button>
          <span className="text-[10px] text-muted">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => {
              const newZoom = Math.max(0.3, zoom / 1.4);
              const canvas = canvasRef.current;
              if (!canvas) return;
              const cx = canvas.width / 2;
              const cy = canvas.height / 2;
              const newCellSize = Math.max(1, Math.round(6 * newZoom));
              setOffset({
                x: cx - ((cx - offset.x) / cellSize) * newCellSize,
                y: cy - ((cy - offset.y) / cellSize) * newCellSize,
              });
              setZoom(newZoom);
            }}
            className="flex h-8 w-8 items-center justify-center rounded text-xs text-muted transition-colors hover:bg-surface-light hover:text-foreground"
            title="Zoom out"
          >
            -
          </button>
        </div>

        {/* Canvas area */}
        <div ref={containerRef} className="relative flex-1 cursor-crosshair overflow-hidden">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
          />

          {/* Other users' cursors (shown as highlighted grid cells) */}
          {others.map(({ connectionId, presence }) => {
            const cursor = presence?.cursor as { x: number; y: number } | null;
            const name = (presence?.name as string) ?? "Anonymous";
            const cursorColor = (presence?.color as string) ?? "#888";

            if (!cursor) return null;

            const sx = offset.x + cursor.x * cellSize;
            const sy = offset.y + cursor.y * cellSize;

            return (
              <div
                key={connectionId}
                className="pointer-events-none absolute"
                style={{
                  left: sx,
                  top: sy,
                  width: cellSize,
                  height: cellSize,
                }}
              >
                <div
                  className="h-full w-full border-2"
                  style={{ borderColor: cursorColor }}
                />
                <span
                  className="absolute left-full top-0 ml-1 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: cursorColor }}
                >
                  {name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-8 items-center justify-between border-t border-border bg-surface px-4 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          {connectionCount} user{connectionCount !== 1 ? "s" : ""} online
        </span>
        <span className="flex items-center gap-3">
          <span>
            {self?.presence?.name as string ?? "You"}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-border"
              style={{ backgroundColor: color }}
            />
            {color}
          </span>
          <span>Click to place &middot; Drag to pan &middot; Scroll to zoom</span>
        </span>
      </div>

      {/* Clear password modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-80 rounded-lg border border-border bg-surface p-6 shadow-2xl">
            <h2 className="mb-1 text-sm font-bold tracking-wide text-scheels-red">
              CLEAR CANVAS
            </h2>
            <p className="mb-4 text-xs text-muted">
              Type the password to wipe all {pixelCount.toLocaleString()} pixels.
            </p>
            <input
              type="password"
              value={clearPassword}
              onChange={(e) => {
                setClearPassword(e.target.value);
                setClearError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleClearSubmit()}
              placeholder="Password"
              autoFocus
              className={`mb-3 w-full rounded border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors ${
                clearError
                  ? "border-scheels-red"
                  : "border-border focus:border-scheels-red/50"
              }`}
            />
            {clearError && (
              <p className="mb-3 text-xs text-scheels-red">Wrong password.</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearModal(false)}
                className="rounded px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-light hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleClearSubmit}
                className="rounded bg-scheels-red px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-scheels-red-dark"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
