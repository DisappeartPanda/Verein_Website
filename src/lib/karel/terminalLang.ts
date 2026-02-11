// src/lib/karel/terminalLang.ts
import type { State } from "./engine";
import {
  beepersHere,
  hasBeepersInBag,
  isFrontClear,
  isLeftClear,
  isRightClear,
} from "./engine";

/** ======= Robo Language Types (für Website) ======= */

// Commands aus Robo-Dateien
export type CmdName = "forward" | "turnLeft" | "turnRight" | "pick" | "put";

// Conditions aus Robo-Dateien
export type AtomName =
  | "obstacleAhead"
  | "obstacleLeft"
  | "obstacleRight"
  | "notAtLine8"
  | "beepersHere"
  | "beeperInBag"
  | "won";

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
 * Semantik-Mapping:
 * - obstacleAhead  => NICHT front clear
 * - obstacleLeft   => NICHT left clear
 * - obstacleRight  => NICHT right clear
 * - notAtLine8     => NICHT won (bei dir: win wenn y===0)
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
        case "notAtLine8":
          return !s.won;
        case "beepersHere":
          return beepersHere(s);
        case "beeperInBag":
          return hasBeepersInBag(s);
        case "won":
          return !!s.won;
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

// Type Guards
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

  /** Datei: (program ... ;)* active=NAME. */
  parseRoboFile(): Stmt[] {
    const programs = new Map<string, Stmt[]>();

    this.skipEol();

    // 1) Programme sammeln
    while (true) {
      const t = this.peek();
      if (isIdTok(t) && t.v === "program") {
        const { name, stmts } = this.parseProgramDecl();
        programs.set(name, stmts);
        this.skipEol();
        continue;
      }
      break;
    }

    // 2) active=... lesen
    const t = this.peek();
    if (isIdTok(t) && t.v === "active") {
      const activeName = this.parseActiveDecl();
      const prog = programs.get(activeName);
      if (!prog) throw new Error(`Unbekanntes active-Programm "${activeName}"`);

      // 3) danach nur noch EOL/EOF erlauben
      this.skipEol();
      if (!isEofTok(this.peek())) {
        const rest = this.peek();
        throw new Error(`Unerwarteter Inhalt nach active=... in Zeile ${rest.line}`);
      }

      return prog;
    }

    throw new Error(`Keine active=... Definition gefunden`);
  }

  private parseProgramDecl(): { name: string; stmts: Stmt[] } {
    this.expectKw("program");
    const { v: name } = this.expectId();
    this.skipEol();
    this.expectSym("=");
    this.skipEol();

    const stmts: Stmt[] = [];

    // Statements bis zum Programm-Ende ';'
    while (true) {
      this.skipEol();

      const t = this.peek();
      if (isSymTok(t) && t.v === ";") {
        // Ende des Programms
        this.next();
        break;
      }
      if (isEofTok(t)) throw new Error(`Programm "${name}" nicht mit ";" beendet`);

      // Statement lesen
      stmts.push(this.parseStmt());

      // Danach optionaler Statement-Separator ';' erlauben,
      // ABER: wenn danach "active"/"program"/EOF kommt, war es das Programm-Ende.
      this.skipEol();
      if (this.acceptSym(";")) {
        this.skipEol();
        const after = this.peek();
        if (
          isEofTok(after) ||
          (isIdTok(after) && (after.v === "active" || after.v === "program"))
        ) {
          break;
        }
      }
    }

    return { name, stmts };
  }

  private parseActiveDecl(): string {
    this.expectKw("active");
    this.skipEol();
    this.expectSym("=");
    this.skipEol();
    const { v: name } = this.expectId();
    this.skipEol();
    this.expectSym(".");
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

    const ok =
      name === "forward" ||
      name === "turnLeft" ||
      name === "turnRight" ||
      name === "pick" ||
      name === "put";

    if (!ok) throw new Error(`Unbekanntes Command "${v}" in Zeile ${line}`);
    return { t: "CMD", name, line };
  }

  /** if (cond) { ... } else if (cond) { ... } else { ... } */
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

  /** while cond { ... }  oder while (cond) { ... } */
  private parseWhile(): Stmt {
    const { line } = this.expectKw("while");
    this.skipEol();

    let cond: Cond;
    if (this.acceptSym("(")) {
      cond = this.parseCondUntil(")");
      this.expectSym(")");
      this.skipEol();
    } else {
      cond = this.parseCondUntil("{");
      this.skipEol();
    }

    const body = this.parseBlock();
    return { t: "WHILE", cond, body, line };
  }

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
      // optionaler ';' als Separator im Block
      this.acceptSym(";");
      this.skipEol();
    }
    return out;
  }

  /** ===== cond grammar: OR -> AND -> NOT -> ATOM / (cond) ===== */

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
        name === "notAtLine8" ||
        name === "beepersHere" ||
        name === "beeperInBag" ||
        name === "won";

      if (!ok) throw new Error(`Unbekannte Condition "${v}" in Zeile ${line}`);
      return { t: "ATOM", name };
    }

    if (isSymTok(t) && t.v === endSym) {
      throw new Error(`Leere Condition vor "${endSym}" in Zeile ${t.line}`);
    }

    throw new Error(`Erwarte Condition in Zeile ${t.line}`);
  }
}

/** API bleibt: parseScript(text) */
export function parseScript(src: string): Stmt[] {
  const toks = tokenize(src);
  const p = new Parser(toks);
  return p.parseRoboFile();
}
