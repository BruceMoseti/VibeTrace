import { useEffect, useRef } from "react";
import type { RunStep } from "../../shared/types";

const GLYPH: Record<RunStep["level"], string> = {
  info: "·",
  action: "▸",
  good: "✓",
  bad: "✕",
  warn: "!",
  test: "◆",
};

function clock(ms: number): string {
  return `${(ms / 1000).toFixed(1).padStart(5)}s`;
}

export function LiveConsole({
  steps,
  running,
  emptyLabel = "Waiting for a run to start…",
  height = 320,
}: {
  steps: RunStep[];
  running: boolean;
  emptyLabel?: string;
  height?: number;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [steps.length]);

  return (
    <div className="console" style={{ height }}>
      {steps.length === 0 && <div className="console-empty">{emptyLabel}</div>}
      {steps.map((s, i) => (
        <div className={`console-line lvl-${s.level}`} key={i}>
          <span className="console-time">{clock(s.t)}</span>
          <span className="console-glyph">{GLYPH[s.level]}</span>
          <span className="console-msg">{s.message}</span>
        </div>
      ))}
      {running && (
        <div className="console-line lvl-info">
          <span className="console-time" />
          <span className="console-cursor" />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
