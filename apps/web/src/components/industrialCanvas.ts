import { t } from "../i18n";
import { createDefaultCauseNodes, type CauseEdgeType, type CauseMapNode } from "./causeMap";
import type { CanvasThresholdRule } from "./chartThresholds";

export const CANVAS_STORAGE_KEY = "open-data-fusion:industrial-canvas:v2";
export const CANVAS_GRID = 4;
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.4;

export type CanvasWidgetKind =
  | "text"
  | "note"
  | "image"
  | "document"
  | "chart"
  | "timeSeries"
  | "model3d"
  | "asset"
  | "ai"
  | "comment"
  | "frame"
  | "causeMap"
  | "drawingPage"
  | "resultsTable";

export type CanvasTool = "select" | "hand" | "connector" | "comment";
export type ChartMode = "line" | "area" | "multi";
export type AiScope = "Selected asset" | "Selected documents" | "Entire canvas";

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasWidgetData {
  text?: string;
  description?: string;
  connected?: boolean;
  sourceLabel?: string;
  sources?: string[];
  fileName?: string;
  fileType?: string;
  fileUrl?: string;
  page?: number;
  viewerZoom?: number;
  chartMode?: ChartMode;
  timeRange?: string;
  hiddenSeries?: string[];
  seriesZoom?: number;
  objectTreeOpen?: boolean;
  modelTool?: "orbit" | "pan";
  modelZoom?: number;
  highlighted?: boolean;
  aiScope?: AiScope;
  aiQuestion?: string;
  aiAnswer?: string;
  aiStatus?: "idle" | "loading" | "ready";
  /** Bound industrial time series persisted with the widget. */
  connectedSeries?: CanvasSeriesBinding[];
  /** High/low threshold rules persisted with a chart or time-series widget. */
  thresholds?: CanvasThresholdRule[];
  /** Custom drag-zoom window; when set it overrides the named timeRange. */
  zoomWindow?: { from: string; to: string } | null;
  assetExternalId?: string;
  causeLayout?: "horizontal" | "vertical";
  causeNodes?: CauseMapNode[];
  causeEdgeFilter?: CauseEdgeType | "all";
  caseKey?: string;
  graphName?: string;
  highlightIds?: string[];
  selectedInstanceId?: string;
  instrumentTag?: string;
  queryInstrument?: string;
}

export interface CanvasSeriesBinding {
  externalId: string;
  assetExternalId: string;
  name: string;
  unit?: string | null;
}

export interface CanvasWidget {
  id: string;
  kind: CanvasWidgetKind;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  locked: boolean;
  collapsed: boolean;
  background: string;
  borderColor: string;
  opacity: number;
  data: CanvasWidgetData;
}

export interface CanvasReply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface CanvasComment {
  id: string;
  widgetId?: string;
  x: number;
  y: number;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  reactions: number;
  replies: CanvasReply[];
}

export interface CanvasConnection {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface IndustrialCanvasState {
  version: 1;
  title: string;
  viewport: CanvasViewport;
  widgets: CanvasWidget[];
  connections: CanvasConnection[];
  comments: CanvasComment[];
  updatedAt: string;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

const widgetDefaults: Record<CanvasWidgetKind, Pick<CanvasWidget, "title" | "width" | "height" | "background"> & { data: CanvasWidgetData }> = {
  text: { title: t("Text"), width: 300, height: 132, background: "#ffffff", data: { text: "" } },
  note: { title: t("Note"), width: 280, height: 190, background: "#fff8d9", data: { text: "" } },
  image: { title: t("Image"), width: 420, height: 300, background: "#ffffff", data: { viewerZoom: 1 } },
  document: { title: t("Document"), width: 430, height: 340, background: "#ffffff", data: { page: 1, viewerZoom: 1 } },
  chart: { title: t("Chart"), width: 470, height: 310, background: "#ffffff", data: { chartMode: "line", timeRange: "24h", seriesZoom: 1 } },
  timeSeries: { title: t("Time series"), width: 470, height: 310, background: "#ffffff", data: { chartMode: "multi", timeRange: "24h", seriesZoom: 1 } },
  model3d: { title: t("3D viewer"), width: 500, height: 340, background: "#ffffff", data: { objectTreeOpen: true, modelTool: "orbit", modelZoom: 1 } },
  asset: { title: t("Asset"), width: 300, height: 220, background: "#ffffff", data: {} },
  ai: { title: t("Ask the canvas"), width: 370, height: 300, background: "#ffffff", data: { aiScope: "Entire canvas", aiStatus: "idle" } },
  comment: { title: t("Comment"), width: 280, height: 170, background: "#ffffff", data: { text: t("Start a discussion") } },
  frame: { title: t("Section"), width: 620, height: 420, background: "#f7f9fc", data: {} },
  causeMap: { title: t("Cause map"), width: 280, height: 200, background: "#ffffff", data: { causeLayout: "horizontal", causeNodes: [] } },
  drawingPage: { title: t("P&ID drawing"), width: 640, height: 480, background: "#ffffff", data: { caseKey: "", graphName: "" } },
  resultsTable: { title: t("Analysis results"), width: 560, height: 360, background: "#ffffff", data: { caseKey: "", instrumentTag: "" } },
};

function id(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function snapToGrid(value: number): number {
  return Math.round(value / CANVAS_GRID) * CANVAS_GRID;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

export function createEmptyCanvas(): IndustrialCanvasState {
  return {
    version: 1,
    title: t("Untitled canvas"),
    viewport: { x: 0, y: 0, zoom: 1 },
    widgets: [],
    connections: [],
    comments: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createWidget(kind: CanvasWidgetKind, point: CanvasPoint, z: number): CanvasWidget {
  const defaults = widgetDefaults[kind];
  return {
    id: id(kind),
    kind,
    title: defaults.title,
    x: snapToGrid(point.x),
    y: snapToGrid(point.y),
    width: defaults.width,
    height: defaults.height,
    z,
    locked: false,
    collapsed: false,
    background: defaults.background,
    borderColor: "#cfd7df",
    opacity: 1,
    data: kind === "causeMap"
      ? { causeLayout: "horizontal", causeNodes: createDefaultCauseNodes() }
      : { ...defaults.data },
  };
}

export function duplicateWidget(widget: CanvasWidget, z: number): CanvasWidget {
  return {
    ...structuredClone(widget),
    id: id(widget.kind),
    title: t("{title} copy", { title: widget.title }),
    x: widget.x + 24,
    y: widget.y + 24,
    z,
    locked: false,
  };
}

export function bringWidgetForward(widget: CanvasWidget, highestZ: number): CanvasWidget {
  return { ...widget, z: Math.max(widget.z + 1, highestZ + 1) };
}

export function sendWidgetBackward(widget: CanvasWidget, lowestZ: number): CanvasWidget {
  return { ...widget, z: Math.max(1, Math.min(widget.z - 1, lowestZ)) };
}

export function zoomAroundPoint(viewport: CanvasViewport, screenPoint: CanvasPoint, nextZoom: number): CanvasViewport {
  const zoom = clampZoom(nextZoom);
  const worldX = (screenPoint.x - viewport.x) / viewport.zoom;
  const worldY = (screenPoint.y - viewport.y) / viewport.zoom;
  return {
    x: Math.round(screenPoint.x - worldX * zoom),
    y: Math.round(screenPoint.y - worldY * zoom),
    zoom,
  };
}

function isCanvasState(value: unknown): value is IndustrialCanvasState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IndustrialCanvasState>;
  return candidate.version === 1
    && typeof candidate.title === "string"
    && Array.isArray(candidate.widgets)
    && Array.isArray(candidate.connections)
    && Array.isArray(candidate.comments)
    && Boolean(candidate.viewport)
    && typeof candidate.viewport?.x === "number"
    && typeof candidate.viewport?.y === "number"
    && typeof candidate.viewport?.zoom === "number";
}

const LEGACY_DISPLAY_TEXT: Record<string, string> = {
  Text: t("Text"),
  Note: t("Note"),
  Image: t("Image"),
  Document: t("Document"),
  Chart: t("Chart"),
  "Time series": t("Time series"),
  "3D viewer": t("3D viewer"),
  Asset: t("Asset"),
  "Ask the canvas": t("Ask the canvas"),
  Comment: t("Comment"),
  Section: t("Section"),
  "Cause map": t("Cause map"),
  "Untitled canvas": t("Untitled canvas"),
  "Start a discussion": t("Start a discussion"),
  "Entire canvas": t("Entire canvas"),
  "What happened?": t("What happened?"),
  "New cause": t("New cause"),
  "P-101 discharge pressure excursion": t("P-101 discharge pressure excursion"),
  "Cooling-water circulation pump at Area A": t("Cooling-water circulation pump at Area A"),
  "Control valve CV-101 stuck partially closed": t("Control valve CV-101 stuck partially closed"),
  "Increased cooling-water demand": t("Increased cooling-water demand"),
  "Instrument / signal issue on PT-101": t("Instrument / signal issue on PT-101"),
  "Actuator air supply pressure low": t("Actuator air supply pressure low"),
  "Positioner calibration drift": t("Positioner calibration drift"),
  "HX-201 fouling reduced heat transfer": t("HX-201 fouling reduced heat transfer"),
  "Parallel cooling train offline": t("Parallel cooling train offline"),
  "Impulse line partially blocked": t("Impulse line partially blocked"),
};

function localizeDisplayText(value: string | undefined): string | undefined {
  if (!value) return value;
  return LEGACY_DISPLAY_TEXT[value] ?? value;
}

export function migrateCanvasState(canvas: IndustrialCanvasState): IndustrialCanvasState {
  return {
    ...canvas,
    title: localizeDisplayText(canvas.title) ?? canvas.title,
    widgets: canvas.widgets.map((widget) => {
      const title = localizeDisplayText(widget.title) ?? widget.title;
      const data = { ...widget.data };
      if (data.text) data.text = localizeDisplayText(data.text) ?? data.text;
            if (widget.kind === "causeMap") {
        const nodes = (data.causeNodes ?? []).map((node) => ({
          ...node,
          label: localizeDisplayText(node.label) ?? node.label,
          detail: localizeDisplayText(node.detail) ?? node.detail,
          collapsed: node.collapsed ?? false,
          edgeType: node.parentId ? (node.edgeType ?? "causes") : node.edgeType,
          evidence: node.evidence ?? {},
        }));
        return {
          ...widget,
          title,
          data: {
            ...data,
            causeNodes: nodes,
            causeEdgeFilter: data.causeEdgeFilter ?? "all",
          },
        };
      }
      return { ...widget, title, data };
    }),
  };
}

export function loadCanvas(storageKey: string = CANVAS_STORAGE_KEY): IndustrialCanvasState {
  if (typeof localStorage === "undefined") return createEmptyCanvas();
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return createEmptyCanvas();
    const parsed: unknown = JSON.parse(stored);
    return isCanvasState(parsed) ? migrateCanvasState(parsed) : createEmptyCanvas();
  } catch {
    return createEmptyCanvas();
  }
}

export function saveCanvas(canvas: IndustrialCanvasState, storageKey: string = CANVAS_STORAGE_KEY): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify({ ...canvas, updatedAt: new Date().toISOString() }));
}

export function clearSavedCanvas(storageKey: string = CANVAS_STORAGE_KEY): IndustrialCanvasState {
  if (typeof localStorage !== "undefined") localStorage.removeItem(storageKey);
  return createEmptyCanvas();
}
