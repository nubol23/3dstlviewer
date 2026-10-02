import type { Dispatch } from "react";
import { BookmarkPlus } from "lucide-react";
import type { AppAction, AppState, LightPreset } from "../../types";
import { LIGHT_SETUPS } from "../../state";
import { ControlSection } from "../Controls";

const MAX_PRESETS = 8;

function describePreset(preset: LightPreset): string {
  const setup = LIGHT_SETUPS.find((candidate) => candidate.lightingMode === preset.lightingMode);
  const values = preset.renderStyle === "smooth" ? "smooth" : `${preset.valueStepCount} values`;
  return setup ? `${setup.name} · ${values}` : values;
}

type PresetsPanelProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
};

export function PresetsPanel({ state, dispatch }: PresetsPanelProps) {
  const locked = state.light.locked;

  return (
    <div className="panel-stack">
      <ControlSection title="Saved looks">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => dispatch({ type: "save-preset" })}
          disabled={locked}
        >
          <BookmarkPlus size={16} aria-hidden="true" />
          <span>Save current look</span>
        </button>
        <p className="hint">
          Saves the light, values and floor. The {MAX_PRESETS} most recent looks are kept on this device.
        </p>
        {locked && <p className="notice" role="status">Unlock the light to save or load a look.</p>}
        {state.presets.length ? (
          <ul className="preset-list">
            {state.presets.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  className="preset"
                  onClick={() => dispatch({ type: "load-preset", presetId: preset.id })}
                  disabled={locked}
                >
                  <span className="preset__name">{preset.name}</span>{" "}
                  <span className="preset__meta">{describePreset(preset)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-note">No saved looks yet.</p>
        )}
      </ControlSection>
    </div>
  );
}
