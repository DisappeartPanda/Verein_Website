// src/lib/karel/terminalLang.ts
import { goalReachable as isGoalReachable } from "./engine";
import type { State } from "./engine";
import {
  beepersHere,
  hasBeepersInBag,
  isFrontClear,
  isLeftClear,
  isRightClear,
} from "./engine";

/** ======= Types ======= */

// Commands (wir bleiben tolerant: Xtext hat nur 3, Engine kann mehr)
export type CmdName = "forward" | "turnLeft" | "turnRight" | "pick" | "put";

// Atom Conditions (Xtext current: obstacle* | won | goalReachable)
export type AtomName =
  | "obstacleAhead"
  | "obstacleLeft"
  | "obstacleRight"
  | "won"
  | "goalReachable"
  // legacy (falls noch genutzt)
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

/**
 * Semantik-Mapping zur Engine:
 * - obstacleAhead  => Wand vorne (also NICHT front clear)
 * - obstacleLeft   => Wand links (also NICHT left clear)
 * - obstacleRight  => Wand rechts (also NICHT right clear)
 * - goalReachable  => hier pragmatisch: front clear (du kannst später Pathfinding ergänzen)
 * - won            => state.won
 * - notAtLine8     => !won (legacy)
 * - beepersHere / beeperInBag => engine helpers (legacy)
 */
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

/** ======= Tokenizer ======= */

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

    // // comments
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

/** ======= Parser ======= */

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
   * - Xtext current: (program ...)+ active=ID [optional '.' or ';']
   * - Legacy:        (program ...)+ active=ID.   (oder active=ID)
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
      // optional trailing '.' or ';' (tolerant)
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
    if (isSymTok(nxt) && nxt.v === "{") {
      // Xtext current: program ID { ProgramDefinition } ;
      this.next(); // '{'
      const stmts = this.parseProgramDefinitionInsideProgramBraces();
      this.skipEol();
      this.expectSym("}");
      this.skipEol();
      this.expectSym(";");
      return { name, stmts };
    }

    // legacy: program ID = ... ;
    this.expectSym("=");
    this.skipEol();
    const stmts: Stmt[] = [];
    while (true) {
      this.skipEol();
      const t = this.peek();
      if (isSymTok(t) && t.v === ";") {
        this.next();
        break;
      }
      if (isEofTok(t)) throw new Error(`Programm "${name}" nicht mit ";" beendet`);
      stmts.push(this.parseStmt());
      this.skipEol();
      // optional statement separator
      if (this.acceptSym(";")) {
        this.skipEol();
        const after = this.peek();
        if (isEofTok(after) || (isIdTok(after) && (after.v === "active" || after.v === "program"))) break;
      }
    }
    return { name, stmts };
  }

  /** ProgramDefinition im aktuellen Xtext: Empty | (statements+=Statement)+  */
  private parseProgramDefinitionInsideProgramBraces(): Stmt[] {
    const stmts: Stmt[] = [];
    this.skipEol();

    // Empty erlaubt: direkt '}' danach
    while (true) {
      const t = this.peek();
      if (isSymTok(t) && t.v === "}") break;
      if (isEofTok(t)) throw new Error(`Programm-Block nicht geschlossen (fehlendes "}")`);
      stmts.push(this.parseStmt());
      this.skipEol();
      // in Xtext current gibt es im Program-Body KEIN Semikolon-Zwang,
      // aber wir erlauben ihn tolerant:
      this.acceptSym(";");
      this.skipEol();
    }

    return stmts;
  }

  /** Active: 'active=' program=[Program] (tolerant: optional '.' oder ';') */
  private parseActive(): string {
    this.expectKw("active");
    this.skipEol();
    this.expectSym("=");
    this.skipEol();
    const { v: name } = this.expectId();
    return name;
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

    // Xtext current hat nur forward/turnLeft/turnRight,
    // wir lassen pick/put für legacy weiterhin zu.
    const ok =
      name === "forward" ||
      name === "turnLeft" ||
      name === "turnRight" ||
      name === "pick" ||
      name === "put";

    if (!ok) throw new Error(`Unbekanntes Command "${v}" in Zeile ${line}`);
    return { t: "CMD", name, line };
  }

  /** Xtext current: if '(' cond ('&&' cond)* ')' block (elseIf)* (else)? */
  private parseIf(): Stmt {
    const { line } = this.expectKw("if");
    this.skipEol();
    this.expectSym("(");
    const cond = this.parseCondUntil(")");
    this.expectSym(")");
    this.skipEol();
    const then = this.parseBlock();

    this.skipEol();

    // else / else if chain
    const nxt = this.peek();
    if (isIdTok(nxt) && nxt.v === "else") {
      this.next(); // else
      this.skipEol();

      const afterElse = this.peek();
      if (isIdTok(afterElse) && afterElse.v === "if") {
        // else if
        const elseIf = this.parseIf();
        return { t: "IF", cond, then, else: [elseIf], line };
      }

      const els = this.parseBlock();
      return { t: "IF", cond, then, else: els, line };
    }

    return { t: "IF", cond, then, line };
  }

  /** Xtext current: while '(' cond ('&&' cond)* ')' block  */
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

  /** Xtext current: Block: '{' (statements+=Statement)+ '}' (mindestens 1), aber wir erlauben leer tolerant */
  private parseBlock(): Stmt[] {
    this.skipEol();
    this.expectSym("{");
    const out: Stmt[] = [];
    this.skipEol();

    while (true) {
      const t = this.peek();
      if (isSymTok(t) && t.v === "}") {
        this.next();
        break;
      }
      if (isEofTok(t)) throw new Error(`Block nicht geschlossen (fehlendes "}")`);
      out.push(this.parseStmt());
      this.skipEol();
      // tolerant: optional ';' zwischen statements
      this.acceptSym(";");
      this.skipEol();
    }

    return out;
  }

  /** ===== Condition Parser (tolerant, superset) =====
   * Xtext current: ('!')? ATOM, kombiniert nur mit &&
   * Wir akzeptieren zusätzlich: || und Klammern, damit alte Dateien weiter gehen.
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
        // legacy:
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

/** ======= JSON Support (flexibel) ======= */

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

function jsonToCond(node: any): Cond {
  // ✅ NEU: String-Conditions erlauben
  if (typeof node === "string") {
    // sehr einfacher Parser:
    // erlaubt: "!won", "won", "obstacleAhead", "a && b", "a || b"
    // (ohne Klammern; reicht für die meisten JSON-Exports)
    const s = node.trim();
    if (!s) throw new Error("JSON: condition ist leer");

    // Split OR
    const orParts = s.split("||").map((x) => x.trim()).filter(Boolean);
    const parseAndChain = (t: string): Cond => {
      const andParts = t.split("&&").map((x) => x.trim()).filter(Boolean);
      const parseAtomOrNot = (a: string): Cond => {
        const aa = a.trim();
        if (aa.startsWith("!")) {
          const innerName = aa.slice(1).trim();
          if (!innerName) throw new Error(`JSON: ungültige condition "${node}"`);
          return { t: "NOT", inner: { t: "ATOM", name: asAtomName(innerName) } };
        }
        return { t: "ATOM", name: asAtomName(aa) };
      };

      let cur = parseAtomOrNot(andParts[0]);
      for (let i = 1; i < andParts.length; i++) {
        cur = { t: "AND", left: cur, right: parseAtomOrNot(andParts[i]) };
      }
      return cur;
    };

    let cur = parseAndChain(orParts[0]);
    for (let i = 1; i < orParts.length; i++) {
      cur = { t: "OR", left: cur, right: parseAndChain(orParts[i]) };
    }
    return cur;
  }

  // bisheriges Verhalten: Objekt-Condition
  if (!isObj(node)) throw new Error(`JSON: Condition muss Objekt sein`);
  const t = String(node.t ?? node.type ?? "").toLowerCase();

  if (t === "atom") return { t: "ATOM", name: asAtomName(node.name ?? node.atom) };
  if (t === "not") return { t: "NOT", inner: jsonToCond(node.inner ?? node.not) };
  if (t === "and") return { t: "AND", left: jsonToCond(node.left), right: jsonToCond(node.right) };
  if (t === "or") return { t: "OR", left: jsonToCond(node.left), right: jsonToCond(node.right) };

  // tolerant: {name:"won"} als Atom
  if (node.name) return { t: "ATOM", name: asAtomName(node.name) };

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

  if (t === "cmd" || t === "move" || node.cmd || node.command) {
    const name = node.name ?? node.cmd ?? node.command;
    return { t: "CMD", name: asCmdName(name), line };
  }

  if (t === "if") {
    const cond = jsonToCond(node.cond ?? node.condition);
    const thenPart = jsonToStmtArray(node.then ?? node.thenBody ?? [], lc);
    let elsePart: Stmt[] | undefined;

    if (node.else != null) {
      elsePart = Array.isArray(node.else) ? jsonToStmtArray(node.else, lc) : [jsonToStmt(node.else, lc)];
    }
    // schema: elseIfs?: [...]
    if (node.elseIfs && Array.isArray(node.elseIfs) && node.elseIfs.length) {
      // wir hängen else-if als else:[IF] an (wie im Text-Parser)
      const chain = node.elseIfs.reduceRight((acc: Stmt[] | undefined, cur: any) => {
        const ifNode: Stmt = {
          t: "IF",
          line: Number.isFinite(cur.line) ? Number(cur.line) : lc.n++,
          cond: jsonToCond(cur.cond ?? cur.condition),
          then: jsonToStmtArray(cur.then ?? cur.block ?? cur.body ?? [], lc),
          else: acc,
        };
        return [ifNode];
      }, elsePart);
      elsePart = chain;
    }

    return elsePart ? { t: "IF", cond, then: thenPart, else: elsePart, line } : { t: "IF", cond, then: thenPart, line };
  }

  if (t === "while") {
    const cond = jsonToCond(node.cond ?? node.condition);
    const body = jsonToStmtArray(node.body ?? node.block ?? [], lc);
    return { t: "WHILE", cond, body, line };
  }

  throw new Error(`JSON: Unbekannter Statement-Typ "${String(node.t ?? node.type)}"`);
}

/**
 * JSON Root akzeptiert mehrere Schemata:
 * A) { active:"main", programs:{ main:[...] } }
 * B) { programName:"...", steps:[...] } (dein “steps”-Schema)
 * C) direkt Array [...]
 */
function parseJsonRoot(root: JsonAny): Stmt[] {
  const lc = { n: 1 };

  // A
  if (isObj(root) && typeof root.active === "string" && isObj(root.programs)) {
    const prog = root.programs[root.active];
    if (!prog) throw new Error(`JSON: active="${root.active}" nicht in programs gefunden`);
    return jsonToStmtArray(prog, lc);
  }

  // B
  if (isObj(root) && Array.isArray(root.steps)) {
    return jsonToStmtArray(root.steps, lc);
  }

  // C
  if (Array.isArray(root)) {
    return jsonToStmtArray(root, lc);
  }

  throw new Error(`JSON: Unbekanntes Root-Format`);
}

/** ======= Public API: auto JSON vs Text ======= */

export function parseScript(src: string): Stmt[] {
  const trimmed = src.trimStart();

  // JSON erkennen
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const obj = JSON.parse(trimmed);
      return parseJsonRoot(obj);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      throw new Error(`JSON Parse/Schema-Fehler: ${msg}`);
    }
  }

  // Text (Xtext current oder legacy)
  const toks = tokenize(src);
  const p = new Parser(toks);
  return p.parseStart();
}
