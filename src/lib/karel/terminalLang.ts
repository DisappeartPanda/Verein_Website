// src/lib/karel/terminalLang.ts
import type { State } from "./engine";
import {
  beepersHere,
  hasBeepersInBag,
  isFrontClear,
  isLeftClear,
  isRightClear,
} from "./engine";

/** ======= Language Types ======= */

export type CmdName = "MOVE" | "TURNLEFT" | "TURNRIGHT" | "PICK" | "PUT";

export type AtomName =
  | "FORWARDFREE"
  | "LEFTFREE"
  | "RIGHTFREE"
  | "BEEPERSHERE"
  | "BEEPERINBAG"
  | "WON";

export type Cond =
  | { t: "ATOM"; name: AtomName }
  | { t: "NOT"; inner: Cond }
  | { t: "AND"; left: Cond; right: Cond }
  | { t: "OR"; left: Cond; right: Cond };

export type Stmt =
  | { t: "CMD"; name: CmdName; line: number }
  | { t: "IF"; cond: Cond; then: Stmt[]; else?: Stmt[]; line: number }
  | { t: "WHILE"; cond: Cond; body: Stmt[]; line: number };

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
        case "FORWARDFREE":
          return isFrontClear(s);
        case "LEFTFREE":
          return isLeftClear(s);
        case "RIGHTFREE":
          return isRightClear(s);
        case "BEEPERSHERE":
          return beepersHere(s);
        case "BEEPERINBAG":
          return hasBeepersInBag(s);
        case "WON":
          return !!s.won;
      }
  }
}

/** ======= Tokenizer ======= */

type Sym = "{" | "}" | "(" | ")" | "!" | "&&" | "||";

type Tok =
  | { k: "id"; v: string; line: number }
  | { k: "sym"; v: Sym; line: number }
  | { k: "eol"; line: number }
  | { k: "eof"; line: number };

// ✅ Type Guards (fixen "Property v does not exist on type Tok" in manchen TS-Configs)
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

    // newline
    if (ch === "\n") {
      toks.push({ k: "eol", line });
      i++;
      line++;
      continue;
    }

    // whitespace
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

    // symbols
    if (ch === "{" || ch === "}" || ch === "(" || ch === ")") {
      toks.push({ k: "sym", v: ch, line });
      i++;
      continue;
    }
    if (ch === "!") {
      toks.push({ k: "sym", v: "!", line });
      i++;
      continue;
    }
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

  private expectSym(v: Sym) {
    const t = this.peek();
    if (isSymTok(t) && t.v === v) return this.next();
    throw new Error(`Erwarte "${v}" in Zeile ${t.line}`);
  }

  private expectId(): { v: string; line: number } {
    const t = this.peek();
    if (isIdTok(t)) {
      const x = this.next();
      // x ist Tok, aber wir wissen: id
      const idTok = x as Extract<Tok, { k: "id" }>;
      return { v: idTok.v, line: idTok.line };
    }
    throw new Error(`Erwarte Identifier in Zeile ${t.line}`);
  }

  parseProgram(): Stmt[] {
    const out: Stmt[] = [];
    this.skipEol();

    while (!isEofTok(this.peek())) {
      out.push(this.parseStmt());
      this.skipEol();
    }
    return out;
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    if (!isIdTok(t)) throw new Error(`Erwarte Statement in Zeile ${t.line}`);

    const { v, line } = this.expectId();
    const kw = v.toUpperCase();

    if (kw === "IF") return this.parseIf(line);
    if (kw === "WHILE") return this.parseWhile(line);

    // Commands
    if (
      kw === "MOVE" ||
      kw === "TURNLEFT" ||
      kw === "TURNRIGHT" ||
      kw === "PICK" ||
      kw === "PUT"
    ) {
      return { t: "CMD", name: kw as CmdName, line };
    }

    throw new Error(`Unbekanntes Statement "${v}" in Zeile ${line}`);
  }

  private parseIf(line: number): Stmt {
    this.skipEol();
    this.expectSym("(");
    const cond = this.parseCond();
    this.expectSym(")");
    this.skipEol();
    this.expectSym("{");
    const then = this.parseBlock();
    this.skipEol();

    // optional ELSE
    const nxt = this.peek();
    if (isIdTok(nxt) && nxt.v.toUpperCase() === "ELSE") {
      this.next();
      this.skipEol();
      this.expectSym("{");
      const els = this.parseBlock();
      return { t: "IF", cond, then, else: els, line };
    }

    return { t: "IF", cond, then, line };
  }

  private parseWhile(line: number): Stmt {
    this.skipEol();
    this.expectSym("(");
    const cond = this.parseCond();
    this.expectSym(")");
    this.skipEol();
    this.expectSym("{");
    const body = this.parseBlock();
    return { t: "WHILE", cond, body, line };
  }

  private parseBlock(): Stmt[] {
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
    }
    return out;
  }

  // cond grammar: OR -> AND -> NOT -> ATOM / (cond)
  private parseCond(): Cond {
    return this.parseOr();
  }

  private parseOr(): Cond {
    let left = this.parseAnd();
    while (true) {
      const t = this.peek();
      if (isSymTok(t) && t.v === "||") {
        this.next();
        const right = this.parseAnd();
        left = { t: "OR", left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseAnd(): Cond {
    let left = this.parseNot();
    while (true) {
      const t = this.peek();
      if (isSymTok(t) && t.v === "&&") {
        this.next();
        const right = this.parseNot();
        left = { t: "AND", left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseNot(): Cond {
    const t = this.peek();
    if (isSymTok(t) && t.v === "!") {
      this.next();
      return { t: "NOT", inner: this.parseNot() };
    }
    return this.parseAtom();
  }

  private parseAtom(): Cond {
    const t = this.peek();

    if (isSymTok(t) && t.v === "(") {
      this.next();
      const c = this.parseCond();
      this.expectSym(")");
      return c;
    }

    if (isIdTok(t)) {
      const { v, line } = this.expectId();
      const name = v.toUpperCase() as AtomName;

      const ok =
        name === "FORWARDFREE" ||
        name === "LEFTFREE" ||
        name === "RIGHTFREE" ||
        name === "BEEPERSHERE" ||
        name === "BEEPERINBAG" ||
        name === "WON";

      if (!ok) throw new Error(`Unbekannte Condition "${v}" in Zeile ${line}`);
      return { t: "ATOM", name };
    }

    throw new Error(`Erwarte Condition in Zeile ${t.line}`);
  }
}

export function parseScript(src: string): Stmt[] {
  const toks = tokenize(src);
  const p = new Parser(toks);
  return p.parseProgram();
}
