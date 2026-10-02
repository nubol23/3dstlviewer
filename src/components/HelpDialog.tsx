import { forwardRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

const SHORTCUTS: ReadonlyArray<{ keys: string[]; action: string }> = [
  { keys: ["O"], action: "Open an STL" },
  { keys: ["F"], action: "Fit the model to the view" },
  { keys: ["R"], action: "Reset the camera" },
  { keys: ["S"], action: "Smooth values" },
  { keys: ["3", "–", "8"], action: "Study in 3 to 8 values" },
  { keys: ["G"], action: "Toggle Neutral Grayscale" },
  { keys: ["L"], action: "Lock or unlock the light" },
  { keys: ["?"], action: "Show this help" },
];

const GESTURES: ReadonlyArray<{ input: string; mouse: string; touch: string }> = [
  { input: "Orbit", mouse: "Drag", touch: "Drag with one finger" },
  { input: "Zoom", mouse: "Scroll or middle-drag", touch: "Pinch" },
  { input: "Pan", mouse: "Right-drag", touch: "Drag with two fingers" },
];

export const HelpDialog = forwardRef<HTMLDialogElement>(function HelpDialog(_props, ref) {
  const close = (event: { currentTarget: HTMLElement }) => event.currentTarget.closest("dialog")?.close();

  return (
    <dialog ref={ref} className="help-dialog" aria-labelledby="help-title">
      <header className="help-dialog__head">
        <h2 id="help-title">Help and shortcuts</h2>
        <IconButton icon={<X size={18} />} label="Close help" onClick={close} />
      </header>
      <section aria-labelledby="help-camera">
        <h3 id="help-camera">Camera</h3>
        <table className="help-table">
          <thead>
            <tr><th scope="col">Move</th><th scope="col">Mouse</th><th scope="col">Touch</th></tr>
          </thead>
          <tbody>
            {GESTURES.map((gesture) => (
              <tr key={gesture.input}><th scope="row">{gesture.input}</th><td>{gesture.mouse}</td><td>{gesture.touch}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-labelledby="help-light">
        <h3 id="help-light">Light</h3>
        <p>Drag the dome to move the key light. In Double Directional, drag marker 2 to move the second light once it is no longer kept opposite. With the dome focused, arrow keys move the key light; hold Shift for bigger steps.</p>
      </section>
      <section aria-labelledby="help-keys" className="help-dialog__keys">
        <h3 id="help-keys">Keyboard</h3>
        <dl className="shortcut-list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.action}>
              <dt>{shortcut.keys.map((key) => (key === "–" ? <span key={key}>–</span> : <kbd key={key}>{key}</kbd>))}</dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
      </section>
    </dialog>
  );
});
