// src/lib/karel/vm.ts
import type { State } from "./engine";
import type { Stmt, Cond, CmdName } from "./terminalLang";
import { evalCond } from "./terminalLang";
import { cmdMove, cmdPick, cmdPut, cmdTurnLeft, cmdTurnRight } from "./engine";

export type Instr =
  | { t: "ACT"; act: CmdName; line: number }
  | { t: "JMP"; to: number; line: number }
  | { t: "JMP_IF_FALSE"; cond: Cond; to: number; line: number };

export type VM = {
  pc: number;
  instr: Instr[];
  done: boolean;
};

export function compile(program: Stmt[]): Instr[] {
  const out: Instr[] = [];
  const emit = (i: Instr) => out.push(i);

  const compileStmts = (stmts: Stmt[]) => {
    for (const s of stmts) {
      if (s.t === "CMD") {
        emit({ t: "ACT", act: s.name, line: s.line });
        continue;
      }

      if (s.t === "IF") {
        const jIfIndex = out.length;
        emit({ t: "JMP_IF_FALSE", cond: s.cond, to: -1, line: s.line });

        compileStmts(s.then);

        const jEndIndex = out.length;
        emit({ t: "JMP", to: -1, line: s.line });

        // IF false -> jump to start of ELSE (or after IF if no else)
        out[jIfIndex] = { ...(out[jIfIndex] as any), to: out.length };

        if (s.else) compileStmts(s.else);

        // end of THEN -> jump after ELSE
        out[jEndIndex] = { ...(out[jEndIndex] as any), to: out.length };
        continue;
      }

      if (s.t === "WHILE") {
        const start = out.length;

        const jIfIndex = out.length;
        emit({ t: "JMP_IF_FALSE", cond: s.cond, to: -1, line: s.line });

        compileStmts(s.body);

        emit({ t: "JMP", to: start, line: s.line });

        // IF false -> jump after loop
        out[jIfIndex] = { ...(out[jIfIndex] as any), to: out.length };
        continue;
      }
    }
  };

  compileStmts(program);
  return out;
}

export function makeVM(instr: Instr[]): VM {
  return { pc: 0, instr, done: instr.length === 0 };
}

export function currentLine(vm: VM): number | null {
  if (vm.done) return null;
  const ins = vm.instr[vm.pc];
  return ins ? ins.line : null;
}

function execAct(act: CmdName, state: State) {
  // Robo-Commands -> Engine
  if (act === "forward") cmdMove(state);
  else if (act === "turnLeft") cmdTurnLeft(state);
  else if (act === "turnRight") cmdTurnRight(state);
  else if (act === "pick") cmdPick(state);
  else cmdPut(state); // "put"
}

export function stepVM(vm: VM, state: State): { line: number | null } {
  if (vm.done) return { line: null };

  // stop immediately if already won
  if (state.won) {
    vm.done = true;
    return { line: null };
  }

  if (vm.pc < 0 || vm.pc >= vm.instr.length) {
    vm.done = true;
    return { line: null };
  }

  const ins = vm.instr[vm.pc];
  const line = ins.line;

  switch (ins.t) {
    case "ACT":
      execAct(ins.act, state);
      vm.pc += 1;
      break;

    case "JMP":
      vm.pc = ins.to;
      break;

    case "JMP_IF_FALSE":
      if (!evalCond(ins.cond, state)) vm.pc = ins.to;
      else vm.pc += 1;
      break;
  }

  if (state.won) vm.done = true;
  if (vm.pc >= vm.instr.length) vm.done = true;

  return { line };
}
