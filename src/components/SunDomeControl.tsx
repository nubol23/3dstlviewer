import { useCallback, useId, useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { LightState, LightingMode } from "../types";
import { RangeControl } from "./Controls";

type SunDomeControlProps = {
  light: LightState;
  onChange: (patch: Partial<LightState>) => void;
  disabled?: boolean;
  lightingMode?: LightingMode;
};

const MIN_ELEVATION = -78;
const MAX_ELEVATION = 90;
const ELEVATION_RANGE = MAX_ELEVATION - MIN_ELEVATION;
const AZIMUTH_DEAD_ZONE = 0.09;
const DOME_INSET_PX = 14;
const HORIZON_RADIUS = Math.sqrt(MAX_ELEVATION / ELEVATION_RANGE);
const MARKER_GRAB_RADIUS_PX = 18;

function toRads(value: number): number {
  return (value * Math.PI) / 180;
}

function formatDegrees(value: number): string {
  return `${value.toFixed(0)}°`;
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

function markerStyle(point: { x: number; y: number }, color: string): CSSProperties {
  return {
    left: `calc(50% + ${point.x} * (50% - ${DOME_INSET_PX}px))`,
    top: `calc(50% + ${point.y} * (50% - ${DOME_INSET_PX}px))`,
    backgroundColor: color,
  };
}

export function SunDomeControl({ light, onChange, disabled = false, lightingMode = "directional" }: SunDomeControlProps) {
  const domeRef = useRef<HTMLButtonElement | null>(null);
  const dragTarget = useRef<"key" | "second" | null>(null);
  const readoutId = useId();
  const classicTop = lightingMode === "zenithal" || lightingMode === "broad-zenithal";
  const directionDisabled = disabled || classicTop;
  const keyPoint = classicTop ? { x: 0, y: 0 } : projectLightToDomePoint(light);
  const secondPoint = lightingMode === "dual"
    ? projectLightToDomePoint({ azimuthDeg: light.secondaryAzimuthDeg, elevationDeg: light.secondaryElevationDeg })
    : null;
  const secondDraggable = Boolean(secondPoint) && !light.secondaryOpposite && !disabled;

  const pointerToDome = useCallback((event: PointerEvent | ReactPointerEvent<HTMLElement>) => {
    if (!domeRef.current) {
      return null;
    }
    const rect = domeRef.current.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2 - DOME_INSET_PX;
    if (radius <= 0) {
      return null;
    }
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    return { x, y, radius, point: { x: toClamped(x / radius), y: toClamped(y / radius) } };
  }, []);

  const setFromPointer = useCallback(
    (event: PointerEvent | ReactPointerEvent<HTMLElement>) => {
      const target = dragTarget.current;
      const dome = pointerToDome(event);
      if (!target || !dome) {
        return;
      }

      if (target === "second") {
        const next = domePointToLightDirection(dome.point, light.secondaryAzimuthDeg);
        onChange({
          secondaryAzimuthDeg: Number(next.azimuthDeg.toFixed(1)),
          secondaryElevationDeg: Number(next.elevationDeg.toFixed(1)),
        });
        return;
      }
      const next = domePointToLightDirection(dome.point, light.azimuthDeg);
      onChange({
        azimuthDeg: Number(next.azimuthDeg.toFixed(1)),
        elevationDeg: Number(next.elevationDeg.toFixed(1)),
      });
    },
    [light.azimuthDeg, light.secondaryAzimuthDeg, onChange, pointerToDome],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dome = pointerToDome(event);
      if (!dome) return;
      const nearSecond = secondDraggable && secondPoint
        && Math.hypot(dome.x - secondPoint.x * dome.radius, dome.y - secondPoint.y * dome.radius) <= MARKER_GRAB_RADIUS_PX;
      if (nearSecond) {
        dragTarget.current = "second";
      } else if (!directionDisabled) {
        dragTarget.current = "key";
      } else {
        return;
      }
      domeRef.current?.setPointerCapture(event.pointerId);
      setFromPointer(event.nativeEvent);
    },
    [directionDisabled, pointerToDome, secondDraggable, secondPoint, setFromPointer],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragTarget.current) return;
      setFromPointer(event.nativeEvent);
    },
    [setFromPointer],
  );

  const endPointer = useCallback(() => {
    dragTarget.current = null;
  }, []);

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

  const directionReadout = classicTop
    ? "Light is directly overhead"
    : `Azimuth ${light.azimuthDeg.toFixed(0)} degrees, elevation ${light.elevationDeg.toFixed(0)} degrees`;

  return (
    <div className="dome-control" data-overhead={classicTop || undefined}>
      <div className="dome-control__pad">
        <button
          type="button"
          className="dome"
          data-testid="sun-dome"
          ref={domeRef}
          aria-label="Light direction pad"
          aria-describedby={readoutId}
          disabled={directionDisabled}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onLostPointerCapture={endPointer}
          onKeyDown={onKeyDown}
        >
          <span
            className="dome__horizon"
            style={{ width: `calc(${HORIZON_RADIUS} * (100% - ${DOME_INSET_PX * 2}px))` }}
            aria-hidden="true"
          />
          <span className="dome__axis dome__axis--h" aria-hidden="true" />
          <span className="dome__axis dome__axis--v" aria-hidden="true" />
          <span className="dome__compass dome__compass--front" aria-hidden="true">Front</span>
          <span className="dome__compass dome__compass--back" aria-hidden="true">Back</span>
          <span className="dome__compass dome__compass--left" aria-hidden="true">L</span>
          <span className="dome__compass dome__compass--right" aria-hidden="true">R</span>
          {secondPoint && <span className="dome__marker dome__marker--second" style={markerStyle(secondPoint, light.secondaryColor)} aria-hidden="true">2</span>}
          <span className="dome__marker" style={markerStyle(keyPoint, light.keyColor)} aria-hidden="true">{secondPoint ? "1" : null}</span>
        </button>
        <div className="dome-control__sliders">
          <RangeControl
            label="Azimuth"
            value={light.azimuthDeg}
            min={0}
            max={360}
            step={1}
            onChange={(value) => onChange({ azimuthDeg: value })}
            disabled={directionDisabled}
            testId="light-azimuth-slider"
            formatValue={formatDegrees}
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
            formatValue={formatDegrees}
          />
        </div>
      </div>
      {classicTop && <p className="hint">Zenithal setups keep the light directly above the model.</p>}
      {!classicTop && <p className="hint">
        Drag on the dome, or focus it and use arrow keys. The edge is below the horizon.
        {secondPoint && (light.secondaryOpposite
          ? " 1 is the key light; 2, the second light, follows it."
          : " 1 is the key light; drag 2 to move the second light.")}
      </p>}
      <div id={readoutId} className="visually-hidden" aria-live="polite" aria-atomic="true">
        {directionReadout}
      </div>
    </div>
  );
}
