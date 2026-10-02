import type { Dispatch } from "react";
import { FolderOpen, RotateCcw, RotateCw } from "lucide-react";
import type { AppAction, AppState, OrientationAxis, OrientationTurnOperation } from "../../types";
import { ColorControl, ControlSection, RangeControl } from "../Controls";

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

type ScenePanelProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  onOpenFile: () => void;
  onRotateModel: (axis: OrientationAxis, quarterTurns: number) => void;
  onResetModelOrientation: () => void;
};

export function ScenePanel({ state, dispatch, onOpenFile, onRotateModel, onResetModelOrientation }: ScenePanelProps) {
  const { model, floor } = state;
  const operations = model?.orientation.operations ?? [];
  const setFloor = (patch: Partial<AppState["floor"]>) => dispatch({ type: "set-floor", patch });

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
            <p>No model open. The sample form shows the current light.</p>
          </div>
        )}
        <button type="button" className="btn btn--solid btn--block" onClick={onOpenFile}>
          <FolderOpen size={16} aria-hidden="true" />
          <span>{model ? "Open another STL" : "Open STL"}</span>
        </button>
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

      <ControlSection title="Floor">
        <RangeControl
          label="Ground Reflectance"
          min={0}
          max={1}
          step={0.01}
          value={floor.reflectance}
          onChange={(reflectance) => setFloor({ reflectance })}
        />
        <ColorControl label="Floor Color" value={floor.color} onChange={(color) => setFloor({ color })} />
        <p className="hint">The floor bounces light onto the model. It does not receive the model's shadow.</p>
      </ControlSection>
    </div>
  );
}
