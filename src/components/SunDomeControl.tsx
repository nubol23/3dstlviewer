import { useCallback, useId, useMemo, useRef } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { LightState } from "../types";
import { RangeControl } from "./Controls";

type SunDomeControlProps = {
  light: LightState;
  onChange: (patch: Partial<LightState>) => void;
  disabled?: boolean;
  zenithalStudy?: boolean;
};

const MIN_ELEVATION = -78;
const MAX_ELEVATION = 78;
const ELEVATION_RANGE = MAX_ELEVATION - MIN_ELEVATION;
const AZIMUTH_DEAD_ZONE = 0.09;

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

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampElevation(value: number): number {
  return Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, value));
}

function wrapAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function projectLightToDomePoint(light: Pick<LightState, "azimuthDeg" | "elevationDeg">): { x: number; y: number } {
  const elevationProgress = clamp01((MAX_ELEVATION - clampElevation(light.elevationDeg)) / ELEVATION_RANGE);
  const radial = Math.sqrt(elevationProgress);
  const azimuthR = toRads(light.azimuthDeg);

  return {
    x: Math.sin(azimuthR) * radial,
    y: -Math.cos(azimuthR) * radial,
  };
}

export function domePointToLightDirection(
  point: { x: number; y: number },
  currentAzimuthDeg: number,
): Pick<LightState, "azimuthDeg" | "elevationDeg"> {
  const radial = clamp01(Math.sqrt(point.x * point.x + point.y * point.y));
  const elevation = clampElevation(MAX_ELEVATION - radial * radial * ELEVATION_RANGE);
  const azimuth = radial < AZIMUTH_DEAD_ZONE
    ? currentAzimuthDeg
    : wrapAzimuth((Math.atan2(point.x, -point.y) * 180) / Math.PI);

  return {
    azimuthDeg: azimuth,
    elevationDeg: elevation,
  };
}

export function SunDomeControl({ light, onChange, disabled = false, zenithalStudy = false }: SunDomeControlProps) {
  const domeRef = useRef<HTMLButtonElement | null>(null);
  const pointerActive = useRef(false);
  const readoutId = useId();
  const directionDisabled = disabled || zenithalStudy;

  const spherePosition = useMemo(() => projectLightToDomePoint(light), [light]);

  const setFromPointer = useCallback(
    (event: PointerEvent | ReactPointerEvent<HTMLElement>) => {
      if (directionDisabled || !domeRef.current) {
        return;
      }

      const rect = domeRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      const radius = Math.min(rect.width, rect.height) / 2 - 14;
      if (radius <= 0) {
        return;
      }

      const nextDirection = domePointToLightDirection(
        {
          x: toClamped(x / radius),
          y: toClamped(y / radius),
        },
        light.azimuthDeg,
      );
      onChange({
        azimuthDeg: Number(nextDirection.azimuthDeg.toFixed(1)),
        elevationDeg: Number(nextDirection.elevationDeg.toFixed(1)),
      });
    },
    [directionDisabled, light.azimuthDeg, onChange],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (directionDisabled) return;
      pointerActive.current = true;
      domeRef.current?.setPointerCapture(event.pointerId);
      setFromPointer(event.nativeEvent);
    },
    [directionDisabled, setFromPointer],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!pointerActive.current || directionDisabled) return;
      setFromPointer(event.nativeEvent);
    },
    [directionDisabled, setFromPointer],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (directionDisabled) return;
      pointerActive.current = false;
      if (!domeRef.current) return;
      domeRef.current.releasePointerCapture(event.pointerId);
    },
    [directionDisabled],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (directionDisabled) {
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
    [directionDisabled, light.azimuthDeg, light.elevationDeg, onChange],
  );

  const distanceRing = Math.max(22, Math.min(46, 24 + light.distance * 4));
  const markerLeft = 50 + spherePosition.x * distanceRing;
  const markerTop = 50 + spherePosition.y * distanceRing;
  const directionReadout = `Azimuth ${light.azimuthDeg.toFixed(0)} degrees, elevation ${light.elevationDeg.toFixed(0)} degrees`;

  return (
    <section className={`sun-dome-panel${zenithalStudy ? " is-zenithal" : ""}`} aria-label="Lighting direction">
      <div className="sun-dome__title">
        <span>Direction</span>
        <span>{zenithalStudy ? "Zenithal" : `Az ${formatInt(light.azimuthDeg)} • El ${formatInt(light.elevationDeg)}`}</span>
      </div>
      <div className="sun-dome-panel__primary">
        <button
          type="button"
          className="sun-dome"
          data-testid="sun-dome"
          ref={domeRef}
          aria-label="Light direction pad"
          aria-describedby={readoutId}
          disabled={directionDisabled}
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
        <div className="sun-dome__sliders sun-dome__sliders--axes">
          <RangeControl
            label="Azimuth"
            value={light.azimuthDeg}
            min={0}
            max={360}
            step={1}
            onChange={(value) => onChange({ azimuthDeg: value })}
            disabled={directionDisabled}
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
            disabled={directionDisabled}
            testId="light-elevation-slider"
            formatValue={(value) => `${value.toFixed(0)}°`}
          />
        </div>
      </div>
      <div id={readoutId} className="visually-hidden" aria-live="polite" aria-atomic="true">
        {directionReadout}
      </div>
      <div className="sun-dome__sliders sun-dome__sliders--advanced">
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
