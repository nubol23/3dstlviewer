import type { ActiveTab, AppAction, AppState, OrientationAxis } from "../types";
import { Bookmark, Box, Contrast, FolderOpen, PanelRightClose, PanelRightOpen, RotateCcw, Scan, Sun } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import type { ChangeEvent, DragEvent, Dispatch, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconButton } from "./IconButton";
import { StudyBar } from "./StudyBar";
import { LightPanel } from "./panels/LightPanel";
import { PresetsPanel } from "./panels/PresetsPanel";
import { ModelPanel } from "./panels/ModelPanel";
import { ValuesPanel } from "./panels/ValuesPanel";

export const SHEET_LAYOUT_QUERY = "(max-width: 760px), (max-width: 1024px) and (orientation: portrait)";

type SheetState = "closed" | "half" | "full";

const TABS: Array<{ value: ActiveTab; label: string; icon: ReactNode }> = [
  { value: "light", label: "Light", icon: <Sun size={18} /> },
  { value: "values", label: "Values", icon: <Contrast size={18} /> },
  { value: "model", label: "Model", icon: <Box size={18} /> },
  { value: "presets", label: "Presets", icon: <Bookmark size={18} /> },
];

const DRAG_THRESHOLD_PX = 6;

type AppShellProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  onFileSelected: (file: File) => void;
  onFitToView: () => void;
  onResetView: () => void;
  onRotateModel: (axis: OrientationAxis, quarterTurns: number) => void;
  onResetModelOrientation: () => void;
  children: ReactNode;
};

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

function snapSheet(height: number): SheetState {
  const ratio = height / window.innerHeight;
  if (ratio < 0.18) return "closed";
  if (ratio < 0.58) return "half";
  return "full";
}

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function AppShell({
  state,
  dispatch,
  onFileSelected,
  onFitToView,
  onResetView,
  onRotateModel,
  onResetModelOrientation,
  children,
}: AppShellProps) {
  const sheetLayout = useMediaQuery(SHEET_LAYOUT_QUERY);
  const [sheet, setSheet] = useState<SheetState>("closed");
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tabWasActiveRef = useRef(false);
  const dragDepthRef = useRef(0);
  const sheetDragRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const suppressHandleClickRef = useRef(false);
  const sheetOpen = !sheetLayout || sheet !== "closed" || sheetDragging;

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [state.activeTab]);

  useEffect(() => {
    if (!sheetLayout || sheet === "closed") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheet("closed");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sheet, sheetLayout]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (file) {
      onFileSelected(file);
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDropActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDropActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDropActive(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".stl")) {
      toast.error(`${file.name} is not an STL file. Drop a .stl file to open it.`);
      return;
    }
    onFileSelected(file);
  };

  const handleTabClick = (value: ActiveTab) => {
    if (!sheetLayout) return;
    if (sheet === "closed") {
      setSheet("half");
    } else if (tabWasActiveRef.current && value === state.activeTab) {
      setSheet("closed");
    }
  };

  const handleSheetPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetDragRef.current = {
      startY: event.clientY,
      startHeight: sheet === "closed" ? 0 : bodyRef.current?.getBoundingClientRect().height ?? 0,
      moved: false,
    };
  };

  const handleSheetPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sheetDragRef.current;
    const body = bodyRef.current;
    if (!drag || !body) return;
    const delta = drag.startY - event.clientY;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      setSheetDragging(true);
    }
    const height = Math.min(window.innerHeight * 0.8, Math.max(0, drag.startHeight + delta));
    body.style.height = `${height}px`;
  };

  const handleSheetPointerEnd = () => {
    const drag = sheetDragRef.current;
    sheetDragRef.current = null;
    if (!drag?.moved) return;
    const body = bodyRef.current;
    const height = body?.getBoundingClientRect().height ?? 0;
    if (body) body.style.height = "";
    suppressHandleClickRef.current = true;
    setSheetDragging(false);
    setSheet(snapSheet(height));
  };

  const handleSheetHandleClick = () => {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }
    setSheet((current) => (current === "half" ? "full" : current === "full" ? "closed" : "half"));
  };

  const sheetHandleLabel = sheet === "closed" ? "Show controls" : sheet === "half" ? "Expand controls" : "Hide controls";

  return (
    <div
      className="app-shell"
      data-layout={sheetLayout ? "sheet" : "sidebar"}
      data-panel={panelOpen ? "open" : "closed"}
      data-sheet={sheetLayout ? sheet : undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="app-bar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span className="brand__name">Miniature Light Studio</span>
        </div>
        {state.model && (
          <p className="app-bar__file" title={state.model.metadata.fileName}>
            <span className="app-bar__file-name">{state.model.metadata.fileName}</span>
            <span className="app-bar__file-meta">{state.model.metadata.triangleCount.toLocaleString()} tris</span>
          </p>
        )}
        <div className="app-bar__actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            data-testid="stl-file-input"
            type="file"
            accept=".stl"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFileChange}
          />
          <button type="button" className="btn btn--primary app-bar__open" onClick={openFilePicker} aria-busy={state.isLoading}>
            <FolderOpen size={16} aria-hidden="true" />
            <span className="app-bar__open-label">Open STL</span>
          </button>
          {!sheetLayout && (
            <IconButton
              icon={panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              label={panelOpen ? "Hide controls" : "Show controls"}
              aria-expanded={panelOpen}
              aria-controls="inspector"
              onClick={() => setPanelOpen((open) => !open)}
            />
          )}
        </div>
      </header>

      <main className="viewport" aria-label="Model viewer">
        {children}
        {state.model && (
          <div className="view-tools" role="toolbar" aria-label="Camera">
            <IconButton icon={<Scan size={18} />} label="Fit to View" onClick={onFitToView} data-testid="fit-view-button" />
            <IconButton icon={<RotateCcw size={18} />} label="Reset View" onClick={onResetView} data-testid="reset-view-button" />
          </div>
        )}
        {!state.model && !state.isLoading && (
          <div className="empty-card">
            <h2>Open an STL to study its values</h2>
            <p>Drop a file anywhere, or choose one. It is read on this device and never uploaded.</p>
            <button type="button" className="btn btn--primary" onClick={openFilePicker}>
              <FolderOpen size={16} aria-hidden="true" />
              <span>Open STL</span>
            </button>
          </div>
        )}
        <StudyBar state={state} dispatch={dispatch} />
        {dropActive && (
          <div className="drop-overlay" aria-hidden="true">
            <span>Drop the STL to open it</span>
          </div>
        )}
      </main>

      <Tabs.Root
        id="inspector"
        className="inspector"
        data-sheet={sheetLayout ? sheet : undefined}
        data-dragging={sheetDragging || undefined}
        hidden={!sheetLayout && !panelOpen}
        value={state.activeTab}
        onValueChange={(value) => dispatch({ type: "set-active-tab", activeTab: value as ActiveTab })}
      >
        {sheetLayout && (
          <button
            type="button"
            className="sheet-handle"
            aria-label={sheetHandleLabel}
            aria-expanded={sheet !== "closed"}
            aria-controls="inspector-body"
            onClick={handleSheetHandleClick}
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerEnd}
            onPointerCancel={handleSheetPointerEnd}
          >
            <span aria-hidden="true" />
          </button>
        )}
        <Tabs.List className="inspector__tabs" aria-label="Controls">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              className="inspector__tab"
              value={tab.value}
              onMouseDown={() => { tabWasActiveRef.current = state.activeTab === tab.value; }}
              onKeyDown={() => { tabWasActiveRef.current = state.activeTab === tab.value; }}
              onClick={() => handleTabClick(tab.value)}
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div id="inspector-body" className="inspector__body" ref={bodyRef} hidden={!sheetOpen}>
          <Tabs.Content value="light" className="inspector__panel">
            <LightPanel state={state} dispatch={dispatch} />
          </Tabs.Content>
          <Tabs.Content value="values" className="inspector__panel">
            <ValuesPanel state={state} dispatch={dispatch} />
          </Tabs.Content>
          <Tabs.Content value="model" className="inspector__panel">
            <ModelPanel
              model={state.model}
              onRotateModel={onRotateModel}
              onResetModelOrientation={onResetModelOrientation}
            />
          </Tabs.Content>
          <Tabs.Content value="presets" className="inspector__panel">
            <PresetsPanel state={state} dispatch={dispatch} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}
