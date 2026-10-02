import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

export type SheetState = "closed" | "half" | "full";

const ORDER: readonly SheetState[] = ["closed", "half", "full"];
const DRAG_THRESHOLD_PX = 6;
const FLICK_PX_PER_MS = 0.45;
const VELOCITY_WINDOW_MS = 100;

export function sheetHeights(viewportHeight: number): Record<SheetState, number> {
  const half = viewportHeight <= 640 ? viewportHeight * 0.4 : Math.min(viewportHeight * 0.46, 440);
  return { closed: 0, half: Math.round(half), full: Math.round(viewportHeight * 0.72) };
}

// A flick moves one stop in its direction; a slow release settles on the nearest stop.
export function settleSheet(height: number, downwardVelocity: number, heights: Record<SheetState, number>): SheetState {
  if (downwardVelocity > FLICK_PX_PER_MS) {
    return [...ORDER].reverse().find((state) => heights[state] < height - 1) ?? "closed";
  }
  if (downwardVelocity < -FLICK_PX_PER_MS) {
    return ORDER.find((state) => heights[state] > height + 1) ?? "full";
  }
  return ORDER.reduce((best, state) => (Math.abs(heights[state] - height) < Math.abs(heights[best] - height) ? state : best));
}

type Drag = {
  startY: number;
  startHeight: number;
  height: number;
  active: boolean;
  samples: Array<{ y: number; t: number }>;
};

export function useBottomSheet(enabled: boolean) {
  const [sheet, setSheet] = useState<SheetState>("closed");
  const [dragging, setDragging] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);
  const heights = sheetHeights(viewportHeight);
  const sheetRef = useRef(sheet);
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const begin = useCallback((y: number) => {
    const startHeight = sheetHeights(window.innerHeight)[sheetRef.current];
    dragRef.current = { startY: y, startHeight, height: startHeight, active: false, samples: [{ y, t: performance.now() }] };
  }, []);

  const move = useCallback((y: number): boolean => {
    const drag = dragRef.current;
    const body = bodyRef.current;
    if (!drag || !body) return false;
    const delta = drag.startY - y;
    if (!drag.active && Math.abs(delta) < DRAG_THRESHOLD_PX) return false;
    if (!drag.active) {
      drag.active = true;
      setDragging(true);
    }
    const now = performance.now();
    drag.samples = [...drag.samples.filter((sample) => now - sample.t < VELOCITY_WINDOW_MS), { y, t: now }];
    drag.height = Math.min(sheetHeights(window.innerHeight).full, Math.max(0, drag.startHeight + delta));
    // Written straight to the element so following the finger skips React renders.
    body.style.height = `${drag.height}px`;
    return true;
  }, []);

  const end = useCallback((fromPointer: boolean) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.active) return;
    const settled = sheetHeights(window.innerHeight);
    const first = drag.samples[0];
    const last = drag.samples[drag.samples.length - 1];
    const velocity = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
    const next = settleSheet(drag.height, velocity, settled);
    if (bodyRef.current) bodyRef.current.style.height = `${settled[next]}px`;
    // A pointer drag that ends over a tab must not also activate that tab.
    suppressClickRef.current = fromPointer;
    setDragging(false);
    setSheet(next);
  }, []);

  // Pulling down on content that is already scrolled to the top drags the sheet,
  // as native sheets do. Touch events are used because only a non-passive
  // touchmove can stop the browser from turning that pull into a page gesture.
  useEffect(() => {
    const body = bodyRef.current;
    if (!enabled || !body) return;
    let startY = 0;
    let mode: "idle" | "drag" | "scroll" = "idle";
    const onTouchStart = (event: TouchEvent) => {
      mode = event.touches.length === 1 ? "idle" : "scroll";
      startY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? startY;
      if (mode === "idle") {
        const pull = y - startY;
        if (body.scrollTop <= 0 && pull > DRAG_THRESHOLD_PX) {
          mode = "drag";
          begin(startY);
        } else if (Math.abs(pull) > DRAG_THRESHOLD_PX) {
          mode = "scroll";
        }
      }
      if (mode === "drag") {
        event.preventDefault();
        move(y);
      }
    };
    const onTouchEnd = () => {
      if (mode === "drag") end(false);
      mode = "idle";
    };
    body.addEventListener("touchstart", onTouchStart, { passive: true });
    body.addEventListener("touchmove", onTouchMove, { passive: false });
    body.addEventListener("touchend", onTouchEnd);
    body.addEventListener("touchcancel", onTouchEnd);
    return () => {
      body.removeEventListener("touchstart", onTouchStart);
      body.removeEventListener("touchmove", onTouchMove);
      body.removeEventListener("touchend", onTouchEnd);
      body.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [begin, end, enabled, move]);

  // The handle and tab bar form one drag surface. The pointer is only captured
  // once the drag passes the threshold, so a tap still reaches the tab.
  const headerProps = enabled
    ? {
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          suppressClickRef.current = false;
          if (event.button === 0) begin(event.clientY);
        },
        onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
          const wasActive = dragRef.current?.active ?? false;
          if (move(event.clientY) && !wasActive) event.currentTarget.setPointerCapture(event.pointerId);
        },
        onPointerUp: () => end(true),
        onPointerCancel: () => end(true),
        // Taking capture from the pressed tab makes the tab report a lost capture
        // that bubbles here; only the header's own loss ends the drag.
        onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => {
          if (event.target === event.currentTarget) end(true);
        },
        onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        },
      }
    : {};

  return {
    sheet,
    setSheet,
    dragging,
    bodyRef,
    bodyHeight: enabled ? heights[sheet] : undefined,
    headerProps,
  };
}
