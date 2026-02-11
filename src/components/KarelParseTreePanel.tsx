import React, { useMemo } from "react";
import type { Cond, Stmt } from "../lib/karel/terminalLang";
import { parseScript } from "../lib/karel/terminalLang";

function condToText(c: Cond): string {
  switch (c.t) {
    case "ATOM":
      return c.name;
    case "NOT":
      return `!(${condToText(c.inner)})`;
    case "AND":
      return `(${condToText(c.left)} && ${condToText(c.right)})`;
    case "OR":
      return `(${condToText(c.left)} || ${condToText(c.right)})`;
  }
}

function StmtNode(props: { s: Stmt; activeLine: number | null; depth: number }) {
  const { s, activeLine, depth } = props;
  const isActive = activeLine !== null && s.line === activeLine;

  const commonStyle: React.CSSProperties = {
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.10)",
    background: isActive ? "rgba(255, 230, 120, .55)" : "rgba(255,255,255,.75)",
    outline: isActive ? "2px solid rgba(255, 200, 0, .55)" : "none",
    marginLeft: depth * 12,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.4,
    display: "grid",
    gap: 6,
  };

  if (s.t === "CMD") {
    return (
      <div style={commonStyle}>
        <div>
          <b>Zeile {s.line}</b> — <span>{s.name}</span>
        </div>
      </div>
    );
  }

  if (s.t === "WHILE") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={commonStyle}>
          <div>
            <b>Zeile {s.line}</b> — <span>WHILE {condToText(s.cond)}</span>
          </div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {s.body.map((x, i) => (
            <StmtNode key={i} s={x} activeLine={activeLine} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  // IF
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={commonStyle}>
        <div>
          <b>Zeile {s.line}</b> — <span>IF {condToText(s.cond)}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {s.then.map((x, i) => (
          <StmtNode key={`t-${i}`} s={x} activeLine={activeLine} depth={depth + 1} />
        ))}
      </div>

      {s.else && (
        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              marginLeft: (depth + 1) * 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              opacity: 0.75,
            }}
          >
            ELSE
          </div>
          {s.else.map((x, i) => (
            <StmtNode key={`e-${i}`} s={x} activeLine={activeLine} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function KarelParseTreePanel(props: {
  source: string | null;
  error: string | null;
  activeLine: number | null;
}) {
  const { source, error, activeLine } = props;

  const program = useMemo(() => {
    if (!source) return null;
    try {
      return parseScript(source);
    } catch {
      return null;
    }
  }, [source]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>ParseTree</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {activeLine ? `Aktiv: Zeile ${activeLine}` : "—"}
        </div>
      </div>

      {!source ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>Noch keine Datei geladen.</div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "#b00020" }}>
          <b>Parse-Fehler:</b> {error}
        </div>
      ) : !program ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>Kein Programm (leer?)</div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,.12)",
            background: "rgba(255,255,255,.85)",
            display: "grid",
            gap: 10,
          }}
        >
          {program.map((s, i) => (
            <StmtNode key={i} s={s} activeLine={activeLine} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
