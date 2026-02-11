import type { Dir, State } from "./engine";
import { keyWall } from "./engine";

function opposite(d: Dir): Dir {
  return d === "N" ? "S" : d === "S" ? "N" : d === "E" ? "W" : "E";
}

function neighbor(x: number, y: number, d: Dir) {
  if (d === "N") return { x, y: y - 1 };
  if (d === "S") return { x, y: y + 1 };
  if (d === "E") return { x: x + 1, y };
  return { x: x - 1, y };
}

function inBounds(w: number, h: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

function addBorderWalls(w: number, h: number, walls: Set<string>) {
  for (let x = 0; x < w; x++) {
    walls.add(keyWall(x, 0, "N"));
    walls.add(keyWall(x, h - 1, "S"));
  }
  for (let y = 0; y < h; y++) {
    walls.add(keyWall(0, y, "W"));
    walls.add(keyWall(w - 1, y, "E"));
  }
}

function addEdgeWall(w: number, h: number, walls: Set<string>, x: number, y: number, d: Dir) {
  walls.add(keyWall(x, y, d));
  const nb = neighbor(x, y, d);
  if (inBounds(w, h, nb.x, nb.y)) {
    walls.add(keyWall(nb.x, nb.y, opposite(d)));
  }
}

/**
 * Ein "Block" ist bei uns eine Zelle, die von 4 Wänden umschlossen ist.
 * (Damit wird sie im Renderer sichtbar und MOVE kann nicht hinein.)
 */
function addBlockedCell(w: number, h: number, walls: Set<string>, x: number, y: number) {
  addEdgeWall(w, h, walls, x, y, "N");
  addEdgeWall(w, h, walls, x, y, "S");
  addEdgeWall(w, h, walls, x, y, "E");
  addEdgeWall(w, h, walls, x, y, "W");
}

function keyXY(x: number, y: number) {
  return `${x},${y}`;
}

export function makeDefaultLevel(): State {
  const width = 8;
  const height = 8;

  const walls = new Set<string>();
  addBorderWalls(width, height, walls);

  const beepers = new Map<string, number>();

  // Start unten links
  const start = { x: 0, y: 7, dir: "N" as const, bag: 0 };

  // ✅ 8 random blocks (nicht auf Start, nicht auf Gewinn-Reihe y=0)
  const blocked = randomBlockedCells(width, height, 8, new Set([keyXY(start.x, start.y)]), 0);
  for (const k of blocked) {
    const [x, y] = k.split(",").map(Number);
    addBlockedCell(width, height, walls, x, y);
  }

  return {
    world: { width, height, walls, beepers },
    robot: start,
    stepCount: 0,
    maxSteps: 2000,
    log: [],
    won: false,
  };
}

/**
 * Wählt count zufällige Zellen aus.
 * - exclude: Zellen, die nie genommen werden dürfen (z.B. Start)
 * - forbidRowY: z.B. 0 => nicht in y=0 (Gewinnreihe) blocken
 */
export function randomBlockedCells(
  width: number,
  height: number,
  count: number,
  exclude: Set<string> = new Set(),
  forbidRowY: number | null = 0
): Set<string> {
  const candidates: string[] = [];
  for (let y = 0; y < height; y++) {
    if (forbidRowY !== null && y === forbidRowY) continue;
    for (let x = 0; x < width; x++) {
      const k = keyXY(x, y);
      if (exclude.has(k)) continue;
      candidates.push(k);
    }
  }

  // Fisher-Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  return new Set(candidates.slice(0, Math.min(count, candidates.length)));
}

/**
 * ✅ Neu: Hindernisse neu platzieren (alles andere bleibt)
 * - behält Startposition/Dir/Bag
 * - behält Beeper
 * - setzt StepCount/Log/Won zurück
 * - baut Walls neu: Border + neue Block-Zellen
 */
export function rerollObstacles(old: State, count = 8): State {
  const w = old.world.width;
  const h = old.world.height;

  const start = { ...old.robot };

  const exclude = new Set<string>([keyXY(start.x, start.y)]);
  const blocks = randomBlockedCells(w, h, count, exclude, 0);

  const walls = new Set<string>();
  addBorderWalls(w, h, walls);
  for (const k of blocks) {
    const [x, y] = k.split(",").map(Number);
    addBlockedCell(w, h, walls, x, y);
  }

  return {
    ...old,
    world: {
      ...old.world,
      walls,
      beepers: new Map(old.world.beepers),
    },
    robot: start,
    stepCount: 0,
    log: [],
    won: false,
  };
}
