import { t } from "../i18n";
import type { CauseMapNode } from "./causeMap";
import type { CanvasWidget, IndustrialCanvasState } from "./industrialCanvas";

export const RCS_CASE_KEY = "demo";
export const RCS_CASE_STORAGE_KEY = "open-data-fusion:industrial-canvas:demo";
export const RCS_CASE_DEFAULT_PAGE = "";

function widget(
  id: string,
  kind: CanvasWidget["kind"],
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
  data: CanvasWidget["data"],
  z: number,
  background = "#ffffff",
): CanvasWidget {
  return {
    id,
    kind,
    title,
    x,
    y,
    width,
    height,
    z,
    locked: false,
    collapsed: false,
    background,
    borderColor: "#cfd7df",
    opacity: 1,
    data,
  };
}

function causeNodes(): CauseMapNode[] {
  return [
    {
      id: "cause-root",
      parentId: null,
      label: t("Instrument failure impact"),
      detail: t("Analysis is derived from the imported graph and documents for the queried tag."),
    },
    {
      id: "cause-channel",
      parentId: "cause-root",
      label: t("Single-channel failure"),
      detail: t("Impact of the instrument channel itself, from the shared-pipe spreadsheet and the risk document when those files are imported."),
      edgeType: "causes",
    },
    {
      id: "cause-pipe",
      parentId: "cause-root",
      label: t("Pipe failure / shared pipe"),
      detail: t("Traverse CONNECTS through pipe segments from the instrument tap, then compare with the imported spreadsheet. Differences are listed for engineering confirmation."),
      edgeType: "causes",
    },
    {
      id: "cause-card",
      parentId: "cause-root",
      label: t("Maintenance mis-touch / shared card"),
      detail: t("Shared-card membership is derived at runtime from the point table, risk document, and PMS PDF. Conflicting sources are listed separately and are not merged."),
      edgeType: "contributes",
    },
  ];
}

export function createCaseCanvas(caseKey: string): IndustrialCanvasState {
  return {
    version: 1,
    title: t("Industrial case canvas"),
    viewport: { x: 24, y: 16, zoom: 0.72 },
    widgets: [
      widget("case-note", "note", t("Case brief"), 24, 16, 520, 150, {
        text: t("Import a local case package (graph plus optional point table, shared-pipe spreadsheet, and risk documents), then select a symbol on the drawing or enter an instrument tag to analyze single-channel, shared-pipe, and shared-card impact. This distribution does not include any private plant case."),
      }, 1, "#fff8d9"),
      widget("case-drawing", "drawingPage", t("P&ID drawing"), 24, 184, 980, 720, {
        caseKey,
        instrumentTag: "",
        graphName: "",
        highlightIds: [],
      }, 2),
      widget("case-cause", "causeMap", t("Failure-mode cause map"), 1024, 16, 620, 520, {
        causeLayout: "horizontal",
        causeNodes: causeNodes(),
        causeEdgeFilter: "all",
      }, 3),
      widget("case-results", "resultsTable", t("Analysis results"), 1024, 552, 620, 352, {
        caseKey,
        instrumentTag: "",
      }, 4),
    ],
    connections: [
      { id: "case-link-draw-cause", sourceId: "case-drawing", targetId: "case-cause" },
      { id: "case-link-cause-results", sourceId: "case-cause", targetId: "case-results" },
    ],
    comments: [],
    updatedAt: new Date().toISOString(),
  };
}

/** @deprecated Use createCaseCanvas(caseKey). Kept so existing imports compile. */
export function createRcsCaseCanvas(caseKey = ""): IndustrialCanvasState {
  return createCaseCanvas(caseKey);
}

export function canvasStorageKeyFor(caseKey?: string | null): string {
  return caseKey ? `open-data-fusion:industrial-canvas:${caseKey}` : "open-data-fusion:industrial-canvas:v2";
}
