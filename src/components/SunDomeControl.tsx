import { useCallback, useId, useMemo, useRef } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { LightState } from "../types";
import { RangeControl } from "./Controls";

type SunDomeControlProps = {
  light: LightState;
  onChange: (patch: Partial<LightState>) => void;
  disabled?: boolean;
};

const MIN_ELEVATION = -78;
const MAX_ELEVATION = 78;

function toRads(value: number): number {
  return (value * Math.PI) / 180;
}

function formatInt(v: number): string {
  return `${v.toFixed(0)}°`;
}

function toClamped(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function clampElevation(value: number): number {
  return Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, value));
}

function wrapAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function SunDomeControl({ light, onChange, disabled = false }: SunDomeControlProps) {
  const domeRef = useRef<HTMLButtonElement | null>(null);
  const pointerActive = useRef(false);
  const readoutId = useId();

  const spherePosition = useMemo(() => {
    const elevationR = toRads(light.elevationDeg);
    const azimuthR = toRads(light.azimuthDeg);
    return {
      x: Math.cos(elevationR) * Math.sin(azimuthR),
      y: Math.sin(elevationR),
    };
  }, [light.azimuthDeg, light.elevationDeg]);

  const setFromPointer = useCallback(
    (event: PointerEvent | ReactPointerEvent<HTMLElement>) => {
      if (disabled || !domeRef.current) {
        return;
      }

      const rect = domeRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      const radius = Math.min(rect.width, rect.height) / 2 - 14;
      if (radius <= 0) {
        return;
      }

      const azimuth = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
      const rawElevation = toClamped(-y / radius) * 78;
      const elevation = clampElevation(rawElevation);
      onChange({
        azimuthDeg: Number(azimuth.toFixed(1)),
        elevationDeg: Number(elevation.toFixed(1)),
      });
    },
    [disabled, onChange],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      pointerActive.current = true;
      domeRef.current?.setPointerCapture(event.pointerId);
      setFromPointer(event.nativeEvent);
    },
    [disabled, setFromPointer],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!pointerActive.current || disabled) return;
      setFromPointer(event.nativeEvent);
    },
    [disabled, setFromPointer],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      pointerActive.current = false;
      if (!domeRef.current) return;
      domeRef.current.releasePointerCapture(event.pointerId);
    },
    [disabled],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }

      const step = event.shiftKey ? 15 : 5;
      let patch: Partial<LightState> | null = null;
      if (event.key === "ArrowLeft") {
        patch = { azimuthDeg: wrapAzimuth(light.azimuthDeg - step) };
      } else if (event.key === "ArrowRight") {
        patch = { azimuthDeg: wrapAzimuth(light.azimuthDeg + step) };
      } else if (event.key === "ArrowUp") {
        patch = { elevationDeg: clampElevation(light.elevationDeg + step) };
      } else if (event.key === "ArrowDown") {
        patch = { elevationDeg: clampElevation(light.elevationDeg - step) };
      }

      if (!patch) {
        return;
      }

      event.preventDefault();
      onChange(patch);
    },
    [disabled, light.azimuthDeg, light.elevationDeg, onChange],
  );

  const distanceRing = Math.max(22, Math.min(46, 24 + light.distance * 4));
  const markerLeft = 50 + spherePosition.x * distanceRing;
  const markerTop = 50 + -spherePosition.y * distanceRing;
  const directionReadout = `Azimuth ${light.azimuthDeg.toFixed(0)} degrees, elevation ${light.elevationDeg.toFixed(0)} degrees`;

  return (
    <section className="sun-dome-panel" aria-label="Lighting direction">
      <div className="sun-dome__title">
        <span>Direction</span>
        <span>Az {formatInt(light.azimuthDeg)} • El {formatInt(light.elevationDeg)}</span>
      </div>
      <button
        type="button"
        className="sun-dome"
        data-testid="sun-dome"
        ref={domeRef}
        aria-label="Light direction pad"
        aria-describedby={readoutId}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <span
          className="sun-dome__ring"
          style={{
            width: `${distanceRing * 2}%`,
            height: `${distanceRing * 2}%`,
          }}
        />
        <span className="sun-dome__marker" style={{ left: `${markerLeft}%`, top: `${markerTop}%` }} />
      </button>
      <div id={readoutId} className="visually-hidden" aria-live="polite" aria-atomic="true">
        {directionReadout}
      </div>
      <div className="sun-dome__sliders">
        <RangeControl
          label="Azimuth"
          value={light.azimuthDeg}
          min={0}
          max={360}
          step={1}
          onChange={(value) => onChange({ azimuthDeg: value })}
          disabled={disabled}
          testId="light-azimuth-slider"
          formatValue={(value) => `${value.toFixed(0)}°`}
        />
        <RangeControl
          label="Elevation"
          value={light.elevationDeg}
          min={MIN_ELEVATION}
          max={MAX_ELEVATION}
          step={1}
          onChange={(value) => onChange({ elevationDeg: value })}
          disabled={disabled}
          testId="light-elevation-slider"
          formatValue={(value) => `${value.toFixed(0)}°`}
        />
        <RangeControl
          label="Distance"
          value={light.distance}
          min={1}
          max={6}
          step={0.05}
          onChange={(value) => onChange({ distance: value })}
          suffix=" m"
          disabled={disabled}
          testId="light-distance-slider"
          formatValue={(value) => `${value.toFixed(2)}m`}
        />
        <RangeControl
          label="Intensity"
          value={light.intensity}
          min={0.1}
          max={2.5}
          step={0.01}
          onChange={(value) => onChange({ intensity: value })}
          disabled={disabled}
          testId="light-intensity-slider"
          formatValue={(value) => value.toFixed(2)}
        />
        <RangeControl
          label="Bounce Strength"
          value={light.bounceStrength}
          min={0}
          max={0.6}
          step={0.01}
          onChange={(value) => onChange({ bounceStrength: value })}
          disabled={disabled}
          testId="light-bounce-slider"
          formatValue={(value) => value.toFixed(2)}
        />
        <RangeControl
          label="Shadow Softness"
          value={light.shadowSoftness}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => onChange({ shadowSoftness: value })}
          disabled={disabled}
          testId="light-shadow-softness-slider"
          formatValue={(value) => value.toFixed(2)}
        />
      </div>
    </section>
  );
}
