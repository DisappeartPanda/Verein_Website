import type { State, Dir } from "./engine";
import { keyWall } from "./engine";

function angle(d: Dir) {
  if (d === "N") return -Math.PI / 2;
  if (d === "E") return 0;
  if (d === "S") return Math.PI / 2;
  return Math.PI;
}

function hasWall(s: State, x: number, y: number, d: Dir) {
  return s.world.walls.has(keyWall(x, y, d));
}

function isBlockedCell(s: State, x: number, y: number) {
  // Heuristik: eine “Block”-Zelle im Editor ist als 4 Wände um die Zelle umgesetzt
  return (
    hasWall(s, x, y, "N") &&
    hasWall(s, x, y, "S") &&
    hasWall(s, x, y, "E") &&
    hasWall(s, x, y, "W")
  );
}

export function renderToCanvas(
  canvas: HTMLCanvasElement,
  state: State,
  cssW: number,
  cssH: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = state.world;
  const size = Math.min(cssW / width, cssH / height);

  ctx.clearRect(0, 0, cssW, cssH);

  // --- Background grid ---
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * size, 0);
    ctx.lineTo(x * size, height * size);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * size);
    ctx.lineTo(width * size, y * size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- Block cells (filled) ---
  // (macht Blocks sofort sichtbar)
  ctx.globalAlpha = 0.22;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlockedCell(state, x, y)) {
        ctx.fillRect(x * size, y * size, size, size);
      }
    }
  }
  ctx.globalAlpha = 1;

  // --- Walls (edges) ---
  // Zeichne Wände als dickere Linien
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = Math.max(2, Math.floor(size * 0.08));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = x * size;
      const y0 = y * size;
      const x1 = x0 + size;
      const y1 = y0 + size;

      // N
      if (hasWall(state, x, y, "N")) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
        ctx.stroke();
      }
      // W
      if (hasWall(state, x, y, "W")) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y1);
        ctx.stroke();
      }
      // E
      if (hasWall(state, x, y, "E")) {
        ctx.beginPath();
        ctx.moveTo(x1, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      // S
      if (hasWall(state, x, y, "S")) {
        ctx.beginPath();
        ctx.moveTo(x0, y1);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  // --- Beepers ---
  for (const [k, n] of state.world.beepers) {
    if (n <= 0) continue;
    const [x, y] = k.split(",").map(Number);

    ctx.beginPath();
    ctx.arc(x * size + size / 2, y * size + size / 2, size * 0.18, 0, Math.PI * 2);
    ctx.fill();

    if (n > 1) {
      ctx.globalAlpha = 0.8;
      ctx.fillText(String(n), x * size + size * 0.62, y * size + size * 0.62);
      ctx.globalAlpha = 1;
    }
  }

  // --- Robot ---
  const r = state.robot;
  ctx.save();
  ctx.translate(r.x * size + size / 2, r.y * size + size / 2);
  ctx.rotate(angle(r.dir));
  ctx.beginPath();
  ctx.moveTo(size * 0.25, 0);
  ctx.lineTo(-size * 0.2, size * 0.18);
  ctx.lineTo(-size * 0.2, -size * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
