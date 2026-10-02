import type { Dispatch, FormEvent } from "react";
import { useState } from "react";
import { BookmarkPlus, Pencil, Trash2 } from "lucide-react";
import type { AppAction, AppState, LightPreset } from "../../types";
import { LIGHT_SETUPS, MAX_PRESET_NAME_LENGTH, MAX_PRESETS } from "../../state";
import { ControlSection } from "../Controls";
import { IconButton } from "../IconButton";

function describePreset(preset: LightPreset): string {
  const setup = LIGHT_SETUPS.find((candidate) => candidate.lightingMode === preset.lightingMode);
  const values = preset.renderStyle === "smooth" ? "smooth" : `${preset.valueStepCount} values`;
  return setup ? `${setup.name} · ${values}` : values;
}

type PresetsPanelProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  onDelete: (preset: LightPreset, index: number) => void;
};

export function PresetsPanel({ state, dispatch, onDelete }: PresetsPanelProps) {
  const locked = state.light.locked;
  const full = state.presets.length >= MAX_PRESETS;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startRename = (preset: LightPreset) => {
    setEditingId(preset.id);
    setDraftName(preset.name);
  };

  const commitRename = (event?: FormEvent) => {
    event?.preventDefault();
    if (editingId && draftName.trim()) {
      dispatch({ type: "rename-preset", presetId: editingId, name: draftName });
    }
    setEditingId(null);
  };

  return (
    <div className="panel-stack">
      <ControlSection title="Saved presets">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => dispatch({ type: "save-preset" })}
          disabled={full}
        >
          <BookmarkPlus size={16} aria-hidden="true" />
          <span>Save preset</span>
        </button>
        <p className="hint">
          {full
            ? `All ${MAX_PRESETS} slots are used. Delete a preset to save a new one.`
            : `Saves the light, colors, values and floor on this device. ${state.presets.length} of ${MAX_PRESETS} used.`}
        </p>
        {locked && <p className="notice" role="status">The light is locked. Unlock it to load a preset.</p>}
        {state.presets.length ? (
          <ul className="preset-list">
            {state.presets.map((preset, index) => (
              <li key={preset.id} className="preset">
                {editingId === preset.id ? (
                  <form className="preset__rename" onSubmit={commitRename}>
                    <input
                      aria-label="Preset name"
                      value={draftName}
                      maxLength={MAX_PRESET_NAME_LENGTH}
                      // Focus moves into the field the user just asked to edit.
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => commitRename()}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setEditingId(null);
                        }
                      }}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="preset__load"
                    onClick={() => dispatch({ type: "load-preset", presetId: preset.id })}
                    disabled={locked}
                  >
                    <span className="preset__name">{preset.name}</span>{" "}
                    <span className="preset__meta">{describePreset(preset)}</span>
                  </button>
                )}
                <div className="preset__actions">
                  <IconButton icon={<Pencil size={15} />} label={`Rename ${preset.name}`} onClick={() => startRename(preset)} />
                  <IconButton icon={<Trash2 size={15} />} label={`Delete ${preset.name}`} onClick={() => onDelete(preset, index)} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-note">No saved presets yet.</p>
        )}
      </ControlSection>
    </div>
  );
}
