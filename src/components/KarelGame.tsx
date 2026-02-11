import React, { useEffect, useMemo, useRef, useState } from "react";

import type { State } from "../lib/karel/engine";
import { cloneState } from "../lib/karel/engine";

import { renderToCanvas } from "../lib/karel/render";
import { makeDefaultLevel, rerollObstacles } from "../lib/karel/levels";

import { parseScript } from "../lib/karel/terminalLang";
import { compile, currentLine, makeVM, stepVM } from "../lib/karel/vm";
import type { VM } from "../lib/karel/vm";

import KarelParseTreePanel from "./KarelParseTreePanel";

const COLS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const ROWS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export default function KarelGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const baseLevel = useMemo<State>(() => makeDefaultLevel(), []);
  const [initialState, setInitialState] = useState<State>(() => cloneState(baseLevel));
  const [state, setState] = useState<State>(() => cloneState(initialState));

  // Datei/Parse
  const [source, setSource] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // VM / Run Controls
  const [vm, setVM] = useState<VM | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(6); // 1..10
  const [activeLine, setActiveLine] = useState<number | null>(null);

  // Board rendern
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderToCanvas(canvas, state, rect.width, rect.height);
  }, [state]);

  function resetToInitial() {
    setRunning(false);
    setVM(null);
    setActiveLine(null);
    setState(cloneState(initialState));
  }

  function reroll() {
    setRunning(false);
    setVM(null);
    setActiveLine(null);

    const nextInitial = rerollObstacles(initialState, 8);
    setInitialState(cloneState(nextInitial));
    setState(cloneState(nextInitial));
  }

  function buildVmFromSource(text: string) {
    const program = parseScript(text);
    const instr = compile(program);
    const newVM = makeVM(instr);
    setVM(newVM);
    setActiveLine(currentLine(newVM));
    setState(cloneState(initialState)); // Startzustand zurücksetzen
    return newVM;
  }

  function startRun() {
    if (!source) return;
    if (parseError) return;

    setRunning(false);

    try {
      const newVM = buildVmFromSource(source);
      setRunning(true);
      setParseError(null);
      setActiveLine(currentLine(newVM));
    } catch (e: any) {
      setRunning(false);
      setVM(null);
      setActiveLine(null);
      setParseError(e?.message ?? String(e));
    }
  }

  function stepOnce() {
    if (!source || parseError) return;

    try {
      let curVM = vm;
      if (!curVM) {
        curVM = buildVmFromSource(source);
      }
      if (curVM.done) return;

      const nextState = cloneState(state);
      const nextVM: VM = { ...curVM, instr: curVM.instr.slice() };

      const res = stepVM(nextVM, nextState);

      setState(nextState);
      setVM(nextVM);
      setActiveLine(res.line ?? currentLine(nextVM));

      if (nextState.won || nextVM.done) {
        setRunning(false);
      }
    } catch (e: any) {
      setRunning(false);
      setParseError(e?.message ?? String(e));
    }
  }

  // Auto-run loop (Play)
  useEffect(() => {
    if (!running) return;
    if (!vm) return;
    if (vm.done) return;

    const delay = Math.max(40, 260 - speed * 20);
    const id = window.setInterval(() => {
      stepOnce();
    }, delay);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, speed, vm, state, source, parseError]);

  function applyFileText(text: string) {
    setSource(text);

    // beim Laden: nur parsen, nicht laufen
    try {
      parseScript(text);
      setParseError(null);
    } catch (e: any) {
      setParseError(e?.message ?? String(e));
    }

    // alles zurücksetzen
    setRunning(false);
    setVM(null);
    setActiveLine(null);
    setState(cloneState(initialState));
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const text = await file.text();
    applyFileText(text);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  const overlayVisible = source === null;

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "1fr 560px",
        gap: 16,
        alignItems: "stretch",
      }}
    >
      {/* Overlay: solange keine Datei geladen */}
      {overlayVisible && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(120,120,120,.35)",
            backdropFilter: "blur(2px)",
            display: "grid",
            placeItems: "center",
            borderRadius: 14,
          }}
        >
          <div
            style={{
              width: "min(560px, 92%)",
              padding: 18,
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,.18)",
              background: "rgba(255,255,255,.92)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>
              Datei hierher ziehen & ablegen
            </div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Danach: Start drücken → Roboter läuft nach ParseTree.
            </div>
          </div>
        </div>
      )}

      {/* LEFT: Board */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 14,
          padding: 12,
          background: "rgba(255,255,255,.9)",
          minHeight: 560,
          position: "relative",
        }}
      >
        {state.won && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,.12)",
              background: "rgba(255,255,255,.95)",
              fontWeight: 800,
            }}
          >
            🎉 Gewonnen! (Reihe 8 erreicht)
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={startRun} disabled={!source || !!parseError}>
            Start
          </button>

          <button
            onClick={() => setRunning((r) => !r)}
            disabled={!vm || !!parseError}
          >
            {running ? "Pause" : "Play"}
          </button>

          <button onClick={stepOnce} disabled={!!parseError || !source}>
            Step
          </button>

          <button onClick={resetToInitial}>Reset</button>

          <label style={{ marginLeft: "auto", fontSize: 12 }}>
            Speed{" "}
            <input
              type="range"
              min={1}
              max={10}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>

          <button onClick={reroll}>Hindernisse neu</button>

          <button
            onClick={() => {
              setSource(null);
              setParseError(null);
              setRunning(false);
              setVM(null);
              setActiveLine(null);
              setState(cloneState(initialState));
            }}
          >
            Datei entfernen
          </button>
        </div>

        {parseError && (
          <div style={{ fontSize: 13, color: "#b00020", marginBottom: 10 }}>
            <b>Fehler:</b> {parseError}
          </div>
        )}

        {/* Labels + board */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr",
            gridTemplateRows: "22px 1fr",
            gap: 8,
            height: "100%",
          }}
        >
          <div />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              alignItems: "center",
              height: 22,
              userSelect: "none",
            }}
          >
            {COLS.map((c) => (
              <div
                key={c}
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  opacity: 0.7,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {c}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateRows: "repeat(8, 1fr)", userSelect: "none" }}>
            {ROWS.map((r) => (
              <div
                key={r}
                style={{
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  opacity: 0.7,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {r}
              </div>
            ))}
          </div>

          <div
            style={{
              border: "1px solid rgba(0,0,0,.12)",
              borderRadius: 12,
              overflow: "hidden",
              background: "rgba(0,0,0,.03)",
              aspectRatio: "1 / 1",
              width: "100%",
              maxHeight: "100%",
              alignSelf: "start",
            }}
          >
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
        </div>
      </div>

      {/* RIGHT: ParseTree with highlight */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 14,
          padding: 12,
          background: "rgba(255,255,255,.9)",
          minHeight: 560,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <KarelParseTreePanel source={source} error={parseError} activeLine={activeLine} />
      </div>
    </div>
  );
}
