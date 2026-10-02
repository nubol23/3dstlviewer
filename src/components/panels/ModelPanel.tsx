import { RotateCcw, RotateCw } from "lucide-react";
import type { AppState, OrientationAxis, OrientationTurnOperation } from "../../types";
import { ControlSection } from "../Controls";

const ORIENTATION_AXES: OrientationAxis[] = ["x", "y", "z"];

function formatOrientationOperation(operation: OrientationTurnOperation): string {
  const direction = operation.quarterTurns === 3 ? "-" : "+";
  const degrees = operation.quarterTurns === 3 ? 90 : operation.quarterTurns * 90;
  return `${operation.axis.toUpperCase()} ${direction}${degrees}°`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ModelPanelProps = {
  model: AppState["model"];
  onRotateModel: (axis: OrientationAxis, quarterTurns: number) => void;
  onResetModelOrientation: () => void;
};

export function ModelPanel({ model, onRotateModel, onResetModelOrientation }: ModelPanelProps) {
  const operations = model?.orientation.operations ?? [];

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
          <ol className="orientation__history" aria-label="Model orientation">
            {operations.length ? (
              operations.map((operation, index) => (
                <li key={`${operation.axis}-${operation.quarterTurns}-${index}`}>
                  {index + 1}. {formatOrientationOperation(operation)}
                </li>
              ))
            ) : (
              <li>{model ? "Identity" : "Open a model to rotate it"}</li>
            )}
          </ol>
          <div className="orientation__grid">
            {ORIENTATION_AXES.map((axis) => (
              <div className="orientation__axis" key={axis}>
                <span className="orientation__axis-label">{axis.toUpperCase()}</span>
                <button
                  type="button"
                  className="btn btn--solid"
                  onClick={() => onRotateModel(axis, -1)}
                  disabled={!model}
                  data-testid={`rotate-${axis}-negative`}
                  aria-label={`Rotate ${axis.toUpperCase()} negative 90 degrees`}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>−90°</span>
                </button>
                <button
                  type="button"
                  className="btn btn--solid"
                  onClick={() => onRotateModel(axis, 1)}
                  disabled={!model}
                  data-testid={`rotate-${axis}-positive`}
                  aria-label={`Rotate ${axis.toUpperCase()} positive 90 degrees`}
                >
                  <RotateCw size={15} aria-hidden="true" />
                  <span>+90°</span>
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={onResetModelOrientation}
            disabled={!model}
            data-testid="reset-model-orientation-button"
          >
            Reset Orientation
          </button>
        </div>
      </ControlSection>

    </div>
  );
}
