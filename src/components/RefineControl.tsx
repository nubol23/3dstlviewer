import { Sparkles, Square, Undo2 } from "lucide-react";
import type { CSSProperties } from "react";
import { REFINEMENT_SAMPLE_BUDGET, type RefinementStatus } from "./StudyPipeline";

function describe(status: RefinementStatus): { text: string; progress: number | null } {
  switch (status.phase) {
    case "preparing":
      return { text: `Preparing scene · ${Math.round(status.progress * 100)}%`, progress: status.progress };
    case "compiling":
      return { text: "Compiling shaders…", progress: null };
    case "sampling":
      return {
        text: `Refining · ${Math.floor(status.samples)}/${REFINEMENT_SAMPLE_BUDGET} samples`,
        progress: Math.min(1, status.samples / REFINEMENT_SAMPLE_BUDGET),
      };
    case "done":
      return { text: `Refined · ${Math.floor(status.samples)} samples`, progress: 1 };
    case "error":
      return { text: `Refinement failed: ${status.message ?? "unknown error"}`, progress: null };
    default:
      return { text: "Preview", progress: null };
  }
}

type RefineControlProps = {
  status: RefinementStatus;
  hasModel: boolean;
  onRefine: () => void;
  onStop: () => void;
};

export function RefineControl({ status, hasModel, onRefine, onStop }: RefineControlProps) {
  const { text, progress } = describe(status);
  const working = status.phase === "preparing" || status.phase === "compiling" || status.phase === "sampling";

  return (
    <div className="refinement-controls" data-phase={status.phase}>
      <span className="refinement-controls__status" role="status" aria-live="polite">{text}</span>
      {working && (
        <span
          className="refinement-controls__progress"
          data-indeterminate={progress === null || undefined}
          style={{ "--progress": `${(progress ?? 0) * 100}%` } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {working && (
        <button type="button" className="btn btn--solid" onClick={onStop}>
          <Square size={13} aria-hidden="true" />
          <span>Stop refinement</span>
        </button>
      )}
      {status.phase === "done" && (
        <button type="button" className="btn btn--solid" onClick={onStop}>
          <Undo2 size={14} aria-hidden="true" />
          <span>Back to preview</span>
        </button>
      )}
      {(status.phase === "preview" || status.phase === "error" || status.phase === "done") && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={onRefine}
          disabled={!hasModel}
          title="Path-trace the current light for accurate bounce light and soft shadows"
        >
          <Sparkles size={15} aria-hidden="true" />
          <span>{status.phase === "error" ? "Try again" : status.phase === "done" ? "Refine again" : "Refine lighting"}</span>
        </button>
      )}
    </div>
  );
}
