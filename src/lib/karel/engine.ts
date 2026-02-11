export type Dir = "N" | "E" | "S" | "W";

export type World = {
  width: number;
  height: number;
  walls: Set<string>;            // "x,y,dir"
  beepers: Map<string, number>;  // "x,y" -> count
};

export type Robot = {
  x: number;
  y: number;
  dir: Dir;
  bag: number;
};

export type State = {
  world: World;
  robot: Robot;
  stepCount: number;
  maxSteps: number;
  log: string[];
  won: boolean;
};

export type KarelError = Error & { code?: string; hint?: string };

function karelError(code: string, message: string, hint?: string): KarelError {
  const e = new Error(message) as KarelError;
  e.code = code;
  e.hint = hint;
  return e;
}

export function keyXY(x: number, y: number) {
  return `${x},${y}`;
}
export function keyWall(x: number, y: number, dir: Dir) {
  return `${x},${y},${dir}`;
}

export function makeState(partial: Omit<State, "won"> & Partial<Pick<State, "won">>): State {
  // ✅ zentraler Default
  return { ...partial, won: partial.won ?? false };
}

export function cloneState(s: State): State {
  return {
    world: {
      width: s.world.width,
      height: s.world.height,
      walls: new Set(s.world.walls),
      beepers: new Map(s.world.beepers),
    },
    robot: { ...s.robot },
    stepCount: s.stepCount,
    maxSteps: s.maxSteps,
    log: [...s.log],
    won: s.won ?? false,
  };
}

export function inBounds(w: World, x: number, y: number) {
  return x >= 0 && y >= 0 && x < w.width && y < w.height;
}

export function turnLeft(d: Dir): Dir {
  return d === "N" ? "W" : d === "W" ? "S" : d === "S" ? "E" : "N";
}
export function turnRight(d: Dir): Dir {
  return d === "N" ? "E" : d === "E" ? "S" : d === "S" ? "W" : "N";
}

export function forwardDelta(d: Dir) {
  if (d === "N") return { dx: 0, dy: -1 };
  if (d === "E") return { dx: 1, dy: 0 };
  if (d === "S") return { dx: 0, dy: 1 };
  return { dx: -1, dy: 0 };
}

function oppositeDir(d: Dir): Dir {
  return d === "N" ? "S" : d === "S" ? "N" : d === "E" ? "W" : "E";
}

export function isDirClear(state: State, dir: Dir) {
  const { robot, world } = state;
  const { dx, dy } = forwardDelta(dir);
  const nx = robot.x + dx;
  const ny = robot.y + dy;

  if (!inBounds(world, nx, ny)) return false;
  if (world.walls.has(keyWall(robot.x, robot.y, dir))) return false;
  if (world.walls.has(keyWall(nx, ny, oppositeDir(dir)))) return false;

  return true;
}

export function isFrontClear(state: State) {
  return isDirClear(state, state.robot.dir);
}
export function isLeftClear(state: State) {
  return isDirClear(state, turnLeft(state.robot.dir));
}
export function isRightClear(state: State) {
  return isDirClear(state, turnRight(state.robot.dir));
}

export function beepersHere(state: State) {
  const k = keyXY(state.robot.x, state.robot.y);
  return (state.world.beepers.get(k) ?? 0) > 0;
}
export function hasBeepersInBag(state: State) {
  return state.robot.bag > 0;
}

function stepGuard(s: State) {
  if (s.stepCount >= s.maxSteps) {
    throw karelError(
      "STEP_LIMIT",
      "Step-Limit erreicht",
      "Deine WHILE-Schleife läuft wahrscheinlich endlos oder braucht zu viele Schritte."
    );
  }
  s.stepCount++;
}

// ✅ Win: Reihe 8 = y===0
function checkWin(s: State) {
  if (!s.won && s.robot.y === 0) {
    s.won = true;
    s.log.push("WIN");
  }
}

export function cmdMove(s: State) {
  stepGuard(s);
  if (!isFrontClear(s)) {
    throw karelError(
      "MOVE_BLOCKED",
      "MOVE blockiert",
      "Vor dir ist eine Wand oder das Spielfeld endet. Nutze FORWARDFREE oder drehe dich vorher."
    );
  }
  const { dx, dy } = forwardDelta(s.robot.dir);
  s.robot.x += dx;
  s.robot.y += dy;
  checkWin(s);
}

export function cmdTurnLeft(s: State) {
  stepGuard(s);
  s.robot.dir = turnLeft(s.robot.dir);
}
export function cmdTurnRight(s: State) {
  stepGuard(s);
  s.robot.dir = turnRight(s.robot.dir);
}

export function cmdPick(s: State) {
  stepGuard(s);
  const k = keyXY(s.robot.x, s.robot.y);
  const n = s.world.beepers.get(k) ?? 0;
  if (n <= 0) {
    throw karelError(
      "NO_BEEPER_HERE",
      "Kein Beeper hier",
      "Setze erst einen Beeper in das Feld (Level-Editor) oder prüfe mit BEEPERSHERE."
    );
  }
  s.world.beepers.set(k, n - 1);
  s.robot.bag++;
}

export function cmdPut(s: State) {
  stepGuard(s);
  if (s.robot.bag <= 0) {
    throw karelError(
      "NO_BEEPER_IN_BAG",
      "Kein Beeper im Inventar",
      "Du brauchst zuerst PICK oder ein Start-Inventar > 0."
    );
  }
  const k = keyXY(s.robot.x, s.robot.y);
  const n = s.world.beepers.get(k) ?? 0;
  s.world.beepers.set(k, n + 1);
  s.robot.bag--;
}
