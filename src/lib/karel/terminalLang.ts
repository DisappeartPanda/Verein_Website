// src/lib/karel/terminalLang.ts

import type { State } from "./engine";
import {
  beepersHere,
  hasBeepersInBag,
  isFrontClear,
  isLeftClear,
  isRightClear,
  goalReachable as isGoalReachable, // ✅ BFS/Reachability aus engine.ts (wenn vorhanden)
} from "./engine";

/** ======================
 * Language Types
 * ====================== */

// Commands (Xtext current: forward/turnLeft/turnRight; legacy: pick/put optional)
export type CmdName = "forward" | "turnLeft" | "turnRight" | "pick" | "put";

// Atoms (Xtext current: obstacle* | won | goalReachable; legacy: notAtLine8, beepers*)
export type AtomName =
  | "obstacleAhead"
  | "obstacleLeft"
  | "obstacleRight"
  | "won"
  | "goalReachable"
  | "notAtLine8"
  | "beepersHere"
  | "beeperInBag";

export type Cond =
  | { t: "ATOM"; name: AtomName }
  | { t: "NOT"; inner: Cond }
  | { t: "AND"; left: Cond; right: Cond }
  | { t: "OR"; left: Cond; right: Cond };

export type Stmt =
  | { t: "CMD"; name: CmdName; line: number }
  | { t: "IF"; cond: Cond; then: Stmt[]; else?: Stmt[]; line: number }
  | { t: "WHILE"; cond: Cond; body: Stmt[]; line: number };

/** ======================
 * Condition evaluation
 * ====================== */

export function evalCond(c: Cond, s: State): boolean {
  switch (c.t) {
    case "NOT":
      return !evalCond(c.inner, s);
    case "AND":
      return evalCond(c.left, s) && evalCond(c.right, s);
    case "OR":
      return evalCond(c.left, s) || evalCond(c.right, s);
    case "ATOM":
      switch (c.name) {
        case "obstacleAhead":
          return !isFrontClear(s);
        case "obstacleLeft":
          return !isLeftClear(s);
        case "obstacleRight":
          return !isRightClear(s);
        case "goalReachable":
          // ✅ global reachability check (BFS) – muss in engine.ts existieren
          return isGoalReachable(s);
        case "won":
          return !!s.won;
        case "notAtLine8":
          return !s.won;
        case "beepersHere":
          return beepersHere(s);
        case "beeperInBag":
          return hasBeepersInBag(s);
      }
  }
}

/** ======================
 * Tokenizer
 * ====================== */

type Sym = "{" | "}" | "(" | ")" | "=" | ";" | "." | "!" | "&&" | "||";

type Tok =
  | { k: "id"; v: string; line: number }
  | { k: "sym"; v: Sym; line: number }
  | { k: "eol"; line: number }
  | { k: "eof"; line: number };

// type guards
function isIdTok(t: Tok): t is Extract<Tok, { k: "id" }> {
  return t.k === "id";
}
function isSymTok(t: Tok): t is Extract<Tok, { k: "sym" }> {
  return t.k === "sym";
}
function isEolTok(t: Tok): t is Extract<Tok, { k: "eol" }> {
  return t.k === "eol";
}
function isEofTok(t: Tok): t is Extract<Tok, { k: "eof" }> {
  return t.k === "eof";
}

function isWs(ch: string) {
  return ch === " " || ch === "\t" || ch === "\r";
}
function isAlpha(ch: string) {
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || ch === "_";
}
function isAlnum(ch: string) {
  const c = ch.charCodeAt(0);
  return isAlpha(ch) || (c >= 48 && c <= 57);
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\n") {
      toks.push({ k: "eol", line });
      i++;
      line++;
      continue;
    }
    if (isWs(ch)) {
      i++;
      continue;
    }

    // comment //
    if (ch === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    // &&, ||
    if (ch === "&" && src[i + 1] === "&") {
      toks.push({ k: "sym", v: "&&", line });
      i += 2;
      continue;
    }
    if (ch === "|" && src[i + 1] === "|") {
      toks.push({ k: "sym", v: "||", line });
      i += 2;
      continue;
    }

    // single-char symbols
    if (
      ch === "{" ||
      ch === "}" ||
      ch === "(" ||
      ch === ")" ||
      ch === "=" ||
      ch === ";" ||
      ch === "." ||
      ch === "!"
    ) {
      toks.push({ k: "sym", v: ch as Sym, line });
      i++;
      continue;
    }

    // identifier
    if (isAlpha(ch)) {
      const start = i;
      i++;
      while (i < src.length && isAlnum(src[i])) i++;
      const v = src.slice(start, i);
      toks.push({ k: "id", v, line });
      continue;
    }

    throw new Error(`Unerwartetes Zeichen "${ch}" in Zeile ${line}`);
  }

  toks.push({ k: "eof", line });
  return toks;
}

/** ======================
 * Text Parser (Xtext current + legacy tolerant)
 * ====================== */

class Parser {
  private toks: Tok[];
  private p = 0;

  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  private peek(): Tok {
    return this.toks[this.p];
  }
  private next(): Tok {
    return this.toks[this.p++];
  }

  private skipEol() {
    while (isEolTok(this.peek())) this.next();
  }

  private acceptSym(v: Sym): boolean {
    const t = this.peek();
    if (isSymTok(t) && t.v === v) {
      this.next();
      return true;
    }
    return false;
  }

  private expectSym(v: Sym) {
    const t = this.peek();
    if (isSymTok(t) && t.v === v) return this.next();
    throw new Error(`Erwarte "${v}" in Zeile ${t.line}`);
  }

  private expectKw(kwLower: string): { line: number } {
    const t = this.peek();
    if (isIdTok(t) && t.v === kwLower) {
      const x = this.next() as Extract<Tok, { k: "id" }>;
      return { line: x.line };
    }
    throw new Error(`Erwarte "${kwLower}" in Zeile ${t.line}`);
  }

  private expectId(): { v: string; line: number } {
    const t = this.peek();
    if (isIdTok(t)) {
      const x = this.next() as Extract<Tok, { k: "id" }>;
      return { v: x.v, line: x.line };
    }
    throw new Error(`Erwarte Identifier in Zeile ${t.line}`);
  }

  /**
   * Start (tolerant):
   * - Xtext current: (program ID { ... };)+ active=ID [optional '.' or ';']
   * - Legacy:        (program ID = ... ;)+ active=ID. (oder active=ID)
   */
  parseStart(): Stmt[] {
    const programs = new Map<string, Stmt[]>();

    this.skipEol();

    while (true) {
      const t = this.peek();
      if (isIdTok(t) && t.v === "program") {
        const { name, stmts } = this.parseProgramAny();
        programs.set(name, stmts);
        this.skipEol();
        continue;
      }
      break;
    }

    const t = this.peek();
    if (isIdTok(t) && t.v === "active") {
      const activeName = this.parseActive();
      const prog = programs.get(activeName);
      if (!prog) throw new Error(`Unbekanntes active-Programm "${activeName}"`);

      this.skipEol();
      // tolerant: optional trailing '.' or ';'
      this.acceptSym(".");
      this.acceptSym(";");
      this.skipEol();

      if (!isEofTok(this.peek())) {
        const rest = this.peek();
        throw new Error(`Unerwarteter Inhalt nach active=... in Zeile ${rest.line}`);
      }

      return prog;
    }

    throw new Error(`Keine active=... Definition gefunden`);
  }

  /** Entscheidet Xtext-current vs legacy anhand des nächsten Symbols nach ProgramName */
  private parseProgramAny(): { name: string; stmts: Stmt[] } {
    this.expectKw("program");
    const { v: name } = this.expectId();
    this.skipEol();

    const nxt = this.peek();

    // Xtext current: program ID { ... } ;
    if (isSymTok(nxt) && nxt.v === "{") {
      this.next(); // '{'
      const stmts = this.parseStatementsUntil("}");
      this.expectSym("}");
      this.skipEol();
      this.acceptSym(";");
      return { name, stmts };
    }

    // Legacy: program ID = ... ;
    this.expectSym("=");
    this.skipEol();
    const stmts = this.parseStatementsUntil(";");
    this.acceptSym(";");
    return { name, stmts };
  }

  private parseActive(): string {
    this.expectKw("active");
    this.skipEol();
    this.expectSym("=");
    this.skipEol();
    const { v: name } = this.expectId();
    return name;
  }

  /** Parse statements until a symbol is encountered (endSym) */
  private parseStatementsUntil(endSym: Sym): Stmt[] {
    const stmts: Stmt[] = [];
    this.skipEol();

    while (true) {
      const t = this.peek();
      if (isSymTok(t) && t.v === endSym) break;
      if (isEofTok(t)) throw new Error(`Unerwartetes EOF (fehlendes "${endSym}")`);

      stmts.push(this.parseStmt());

      this.skipEol();
      // tolerant: optional ';' as separator (inside blocks / legacy)
      this.acceptSym(";");
      this.skipEol();
    }

    return stmts;
  }

  private parseStmt(): Stmt {
    this.skipEol();
    const t = this.peek();
    if (!isIdTok(t)) throw new Error(`Erwarte Statement in Zeile ${t.line}`);

    if (t.v === "if") return this.parseIf();
    if (t.v === "while") return this.parseWhile();

    return this.parseCmd();
  }

  private parseCmd(): Stmt {
    const { v, line } = this.expectId();
    const name = v as CmdName;

    const ok =
      name === "forward" ||
      name === "turnLeft" ||
      name === "turnRight" ||
      name === "pick" ||
      name === "put";

    if (!ok) throw new Error(`Unbekanntes Command "${v}" in Zeile ${line}`);
    return { t: "CMD", name, line };
  }

  /** if '(' cond ')' block (else if ...)* (else ...)? */
  private parseIf(): Stmt {
    const { line } = this.expectKw("if");
    this.skipEol();
    this.expectSym("(");
    const cond = this.parseCondUntil(")");
    this.expectSym(")");
    this.skipEol();
    const then = this.parseBlock();

    this.skipEol();

    const nxt = this.peek();
    if (isIdTok(nxt) && nxt.v === "else") {
      this.next(); // else
      this.skipEol();

      const afterElse = this.peek();
      if (isIdTok(afterElse) && afterElse.v === "if") {
        const elseIf = this.parseIf();
        return { t: "IF", cond, then, else: [elseIf], line };
      }

      const els = this.parseBlock();
      return { t: "IF", cond, then, else: els, line };
    }

    return { t: "IF", cond, then, line };
  }

  /** while '(' cond ')' block */
  private parseWhile(): Stmt {
    const { line } = this.expectKw("while");
    this.skipEol();
    this.expectSym("(");
    const cond = this.parseCondUntil(")");
    this.expectSym(")");
    this.skipEol();
    const body = this.parseBlock();
    return { t: "WHILE", cond, body, line };
  }

  private parseBlock(): Stmt[] {
    this.skipEol();
    this.expectSym("{");
    const stmts = this.parseStatementsUntil("}");
    this.expectSym("}");
    return stmts;
  }

  /** ===== Condition grammar (tolerant superset) =====
   * Xtext current: ('!')? ATOM, joined with &&
   * We also accept || and parentheses to stay compatible with earlier inputs.
   */

  private parseCondUntil(endSym: Sym): Cond {
    return this.parseOr(endSym);
  }

  private parseOr(endSym: Sym): Cond {
    let left = this.parseAnd(endSym);
    while (true) {
      const t = this.peek();
      if (isSymTok(t) && t.v === "||") {
        this.next();
        const right = this.parseAnd(endSym);
        left = { t: "OR", left, right };
        continue;
      }
      if (isSymTok(t) && t.v === endSym) break;
      if (isEofTok(t)) break;
      break;
    }
    return left;
  }

  private parseAnd(endSym: Sym): Cond {
    let left = this.parseNot(endSym);
    while (true) {
      const t = this.peek();
      if (isSymTok(t) && t.v === "&&") {
        this.next();
        const right = this.parseNot(endSym);
        left = { t: "AND", left, right };
        continue;
      }
      if (isSymTok(t) && t.v === endSym) break;
      if (isEofTok(t)) break;
      break;
    }
    return left;
  }

  private parseNot(endSym: Sym): Cond {
    const t = this.peek();
    if (isSymTok(t) && t.v === "!") {
      this.next();
      return { t: "NOT", inner: this.parseNot(endSym) };
    }
    return this.parseAtom(endSym);
  }

  private parseAtom(endSym: Sym): Cond {
    const t = this.peek();

    if (isSymTok(t) && t.v === "(") {
      this.next();
      const c = this.parseCondUntil(")");
      this.expectSym(")");
      return c;
    }

    if (isIdTok(t)) {
      const { v, line } = this.expectId();
      const name = v as AtomName;

      const ok =
        name === "obstacleAhead" ||
        name === "obstacleLeft" ||
        name === "obstacleRight" ||
        name === "won" ||
        name === "goalReachable" ||
        name === "notAtLine8" ||
        name === "beepersHere" ||
        name === "beeperInBag";

      if (!ok) throw new Error(`Unbekannte Condition "${v}" in Zeile ${line}`);
      return { t: "ATOM", name };
    }

    if (isSymTok(t) && t.v === endSym) {
      throw new Error(`Leere Condition vor "${endSym}" in Zeile ${t.line}`);
    }

    throw new Error(`Erwarte Condition in Zeile ${t.line}`);
  }
}

/** ======================
 * JSON Support (accepts multiple schemas)
 * ====================== */

type JsonAny = any;

function isObj(x: any): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function asCmdName(x: any): CmdName {
  if (x === "forward" || x === "turnLeft" || x === "turnRight" || x === "pick" || x === "put") return x;
  throw new Error(`JSON: Unbekanntes Command "${String(x)}"`);
}

function asAtomName(x: any): AtomName {
  const v = String(x);
  const ok =
    v === "obstacleAhead" ||
    v === "obstacleLeft" ||
    v === "obstacleRight" ||
    v === "won" ||
    v === "goalReachable" ||
    v === "notAtLine8" ||
    v === "beepersHere" ||
    v === "beeperInBag";
  if (!ok) throw new Error(`JSON: Unbekannte Condition "${v}"`);
  return v as AtomName;
}

/**
 * Accepts:
 * - object conditions: {type:"and", left:..., right:...} etc.
 * - string conditions: "!won && obstacleLeft"
 */
function jsonToCond(node: JsonAny): Cond {
  // ✅ String condition support
  if (typeof node === "string") {
    const s = node.trim();
    if (!s) throw new Error("JSON: condition ist leer");

    // No parentheses parsing here; handles common chains: a && b || !c
    const splitOr = s.split("||").map((x) => x.trim()).filter(Boolean);

    const parseAndChain = (chunk: string): Cond => {
      const parts = chunk.split("&&").map((x) => x.trim()).filter(Boolean);
      if (parts.length === 0) throw new Error(`JSON: ungültige condition "${s}"`);

      const parseAtomOrNot = (p: string): Cond => {
        const pp = p.trim();
        if (pp.startsWith("!")) {
          const inner = pp.slice(1).trim();
          if (!inner) throw new Error(`JSON: ungültige condition "${s}"`);
          return { t: "NOT", inner: { t: "ATOM", name: asAtomName(inner) } };
        }
        return { t: "ATOM", name: asAtomName(pp) };
      };

      let cur = parseAtomOrNot(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        cur = { t: "AND", left: cur, right: parseAtomOrNot(parts[i]) };
      }
      return cur;
    };

    let cur = parseAndChain(splitOr[0]);
    for (let i = 1; i < splitOr.length; i++) {
      cur = { t: "OR", left: cur, right: parseAndChain(splitOr[i]) };
    }
    return cur;
  }

  // Object condition support
  if (!isObj(node)) throw new Error(`JSON: Condition muss Objekt sein`);

  const t = String(node.t ?? node.type ?? "").toLowerCase();

  if (t === "atom") return { t: "ATOM", name: asAtomName(node.name ?? node.atom) };
  if (t === "not") return { t: "NOT", inner: jsonToCond(node.inner ?? node.not) };
  if (t === "and") return { t: "AND", left: jsonToCond(node.left), right: jsonToCond(node.right) };
  if (t === "or") return { t: "OR", left: jsonToCond(node.left), right: jsonToCond(node.right) };

  // tolerant: {name:"won"} means atom
  if (node.name != null) return { t: "ATOM", name: asAtomName(node.name) };

  throw new Error(`JSON: Unbekannter Condition-Knoten`);
}

function jsonToStmtArray(arr: JsonAny, lc: { n: number }): Stmt[] {
  if (!Array.isArray(arr)) throw new Error(`JSON: Erwartet Array von Statements`);
  return arr.map((x) => jsonToStmt(x, lc));
}

function jsonToStmt(node: JsonAny, lc: { n: number }): Stmt {
  if (!isObj(node)) throw new Error(`JSON: Statement muss Objekt sein`);

  const line = Number.isFinite(node.line) ? Number(node.line) : lc.n++;
  const t = String(node.t ?? node.type ?? "").toLowerCase();

  // CMD / move
  if (t === "cmd" || t === "move" || node.cmd || node.command) {
    const name = node.name ?? node.cmd ?? node.command;
    return { t: "CMD", name: asCmdName(name), line };
  }

  // WHILE
  if (t === "while") {
    const cond = jsonToCond(node.cond ?? node.condition);
    const body = jsonToStmtArray(node.body ?? node.block ?? [], lc);
    return { t: "WHILE", cond, body, line };
  }

  // IF (supports elseIfs chain + else)
  if (t === "if") {
    const cond = jsonToCond(node.cond ?? node.condition);
    const thenPart = jsonToStmtArray(node.then ?? [], lc);

    let elsePart: Stmt[] | undefined;

    // else
    if (node.else != null) {
      elsePart = Array.isArray(node.else) ? jsonToStmtArray(node.else, lc) : [jsonToStmt(node.else, lc)];
    }

    // elseIfs: [{condition, then}, ...] -> nested IF chain in else:[IF]
    if (node.elseIfs && Array.isArray(node.elseIfs) && node.elseIfs.length) {
      for (let i = node.elseIfs.length - 1; i >= 0; i--) {
        const eif = node.elseIfs[i];
        if (!isObj(eif)) throw new Error(`JSON: elseIfs[${i}] muss Objekt sein`);

        const ifNode: Stmt = {
          t: "IF",
          line: Number.isFinite(eif.line) ? Number(eif.line) : lc.n++,
          cond: jsonToCond(eif.cond ?? eif.condition),
          then: jsonToStmtArray(eif.then ?? [], lc),
          else: elsePart,
        };

        elsePart = [ifNode];
      }
    }

    return elsePart
      ? { t: "IF", cond, then: thenPart, else: elsePart, line }
      : { t: "IF", cond, then: thenPart, line };
  }

  throw new Error(`JSON: Unbekannter Statement-Typ "${String(node.t ?? node.type)}"`);
}

/**
 * JSON Root accepts:
 * A) { active:"main", programs:{ main:[...] } }
 * B) { programName:"...", steps:[...] }  (your steps schema)
 * C) direct array [...]
 */
function parseJsonRoot(root: JsonAny): Stmt[] {
  const lc = { n: 1 };

  // A: programs+active
  if (isObj(root) && typeof root.active === "string" && isObj(root.programs)) {
    const prog = root.programs[root.active];
    if (!prog) throw new Error(`JSON: active="${root.active}" nicht in programs gefunden`);
    return jsonToStmtArray(prog, lc);
  }

  // B: steps schema
  if (isObj(root) && Array.isArray(root.steps)) {
    return jsonToStmtArray(root.steps, lc);
  }

  // C: direct array
  if (Array.isArray(root)) {
    return jsonToStmtArray(root, lc);
  }

  throw new Error(`JSON: Unbekanntes Root-Format`);
}

/** ======================
 * Public API: auto JSON vs Text
 * ====================== */

export function parseScript(src: string): Stmt[] {
  const trimmed = src.trimStart();

  // JSON mode
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const obj = JSON.parse(trimmed);
      return parseJsonRoot(obj);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      throw new Error(`JSON Parse/Schema-Fehler: ${msg}`);
    }
  }

  // Text mode (Xtext current + legacy)
  const toks = tokenize(src);
  const p = new Parser(toks);
  return p.parseStart();
}
