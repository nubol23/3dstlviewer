import type { ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import type { AppState, OrientationAxis } from "../../types";
import { DEFAULT_MODEL_ORIENTATION } from "../../types";
import { ControlSection } from "../Controls";

type Move = { axis: OrientationAxis; quarterTurns: 1 | -1; label: string; icon: ReactNode };

// Quarter turns are applied about world axes; the default camera looks at the
// model's front from +Z, so +X tips the top toward the viewer, +Y turns the
// front to the viewer's right, and +Z rolls the top to the left.
const MOVES: ReadonlyArray<{ name: string; moves: [Move, Move] }> = [
  {
    name: "Tip",
    moves: [
      { axis: "x", quarterTurns: -1, label: "Tip back", icon: <ArrowUpFromLine size={15} /> },
      { axis: "x", quarterTurns: 1, label: "Tip forward", icon: <ArrowDownToLine size={15} /> },
    ],
  },
  {
    name: "Turn",
    moves: [
      { axis: "y", quarterTurns: -1, label: "Turn left", icon: <RotateCcw size={15} /> },
      { axis: "y", quarterTurns: 1, label: "Turn right", icon: <RotateCw size={15} /> },
    ],
  },
  {
    name: "Roll",
    moves: [
      { axis: "z", quarterTurns: 1, label: "Roll left", icon: <RotateCcw size={15} /> },
      { axis: "z", quarterTurns: -1, label: "Roll right", icon: <RotateCw size={15} /> },
    ],
  },
];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isDefaultOrientation(model: NonNullable<AppState["model"]>): boolean {
  return JSON.stringify(model.orientation.operations) === JSON.stringify(DEFAULT_MODEL_ORIENTATION.operations);
}

type ModelPanelProps = {
  model: AppState["model"];
  canUndo: boolean;
  onRotateModel: (axis: OrientationAxis, quarterTurns: number) => void;
  onUndo: () => void;
  onResetModelOrientation: () => void;
};

export function ModelPanel({ model, canUndo, onRotateModel, onUndo, onResetModelOrientation }: ModelPanelProps) {
  const orientationSummary = !model
    ? "Open a model to change how it stands."
    : isDefaultOrientation(model)
      ? "Standing as imported, with Z up."
      : "Turned from the imported pose. Reset returns it to Z up.";

  return (
    <div className="panel-stack">
      <ControlSection title="Model">
        {model ? (
          <div className="model-card">
            <h4 className="model-card__name" title={model.metadata.fileName}>{model.metadata.fileName}</h4>
            <dl className="model-card__meta">
              <div><dt>Triangles</dt><dd>{model.metadata.triangleCount.toLocaleString()} tris</dd></div>
              <div><dt>File size</dt><dd>{formatFileSize(model.metadata.fileSize)}</dd></div>
            </dl>
          </div>
        ) : (
          <div className="model-card model-card--empty">
            <p>No model open. Use Open STL or drop a file on the viewer. Until then, the sample form shows the current light.</p>
          </div>
        )}
      </ControlSection>

      <ControlSection title="Orientation">
        <div className="orientation" data-testid="model-orientation-control">
          <p className="hint" data-testid="orientation-summary">{orientationSummary}</p>
          <div className="orientation__grid">
            {MOVES.map((row) => (
              <div className="orientation__row" key={row.name} role="group" aria-label={row.name}>
                {row.moves.map((move) => (
                  <button
                    key={move.label}
                    type="button"
                    className="btn btn--solid"
                    onClick={() => onRotateModel(move.axis, move.quarterTurns)}
                    disabled={!model}
                    data-testid={`rotate-${move.axis}-${move.quarterTurns > 0 ? "positive" : "negative"}`}
                  >
                    <span aria-hidden="true">{move.icon}</span>
                    <span>{move.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="button-pair">
            <button type="button" className="btn btn--ghost" onClick={onUndo} disabled={!model || !canUndo}>
              <Undo2 size={15} aria-hidden="true" />
              <span>Undo turn</span>
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onResetModelOrientation}
              disabled={!model || isDefaultOrientation(model)}
              data-testid="reset-model-orientation-button"
            >
              Reset Orientation
            </button>
          </div>
          <p className="hint">Turns are relative to the default front view.</p>
        </div>
      </ControlSection>
    </div>
  );
}
