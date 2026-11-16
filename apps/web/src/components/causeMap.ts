import { t } from "../i18n";
export type CauseMapLayout = "horizontal" | "vertical";
export type CauseEdgeType = "causes" | "contributes" | "monitors" | "measures" | "feeds";

export interface CauseEvidence {
  assets?: string[];
  events?: string[];
  timeSeries?: string[];
  documents?: string[];
  drawingElements?: string[];
}

export interface CauseMapNode {
  id: string;
  parentId: string | null;
  label: string;
  detail?: string;
  collapsed?: boolean;
  edgeType?: CauseEdgeType;
  evidence?: CauseEvidence;
}

export const CAUSE_EDGE_TYPES: Array<{
  id: CauseEdgeType;
  label: string;
  color: string;
  dasharray?: string;
}> = [
  { id: "causes", label: "导致", color: "#c44832" },
  { id: "contributes", label: "加剧", color: "#d07a18", dasharray: "6 3" },
  { id: "monitors", label: "监测", color: "#0b6ffb", dasharray: "2 3" },
  { id: "measures", label: "测量", color: "#159477", dasharray: "1 3" },
  { id: "feeds", label: "供给", color: "#7c5ce7" },
];

export function causeEdgeStyle(type: CauseEdgeType | undefined) {
  return CAUSE_EDGE_TYPES.find((item) => item.id === (type ?? "causes")) ?? CAUSE_EDGE_TYPES[0];
}

export interface CauseNodeBox {
  id: string;
  parentId: string | null;
  label: string;
  detail?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isRoot: boolean;
  collapsed: boolean;
  childCount: number;
  descendantCount: number;
  edgeType?: CauseEdgeType;
  evidence?: CauseEvidence;
}

export interface CauseMapEdge {
  id: string;
  fromId: string;
  toId: string;
  path: string;
  edgeType: CauseEdgeType;
  label: string;
  color: string;
  dasharray?: string;
  labelX: number;
  labelY: number;
}

export const CAUSE_NODE_WIDTH = 196;
export const CAUSE_NODE_HEIGHT = 100;
export const CAUSE_GAP_X = 56;
export const CAUSE_GAP_Y = 28;
export const CAUSE_PAD_X = 16;
export const CAUSE_PAD_Y = 12;
export const CAUSE_TOOLBAR_HEIGHT = 58;

export const DEFAULT_CAUSE_ROOT_LABEL = t("What happened?");

function causeId(): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `cause-${suffix}`;
}

export function createCauseNode(label: string, parentId: string | null, detail?: string, extras: Partial<Pick<CauseMapNode, "edgeType" | "evidence" | "collapsed">> = {}): CauseMapNode {
  return {
    id: causeId(),
    parentId,
    label,
    ...(detail ? { detail } : {}),
    collapsed: extras.collapsed ?? false,
    ...(parentId ? { edgeType: extras.edgeType ?? "causes" } : {}),
    evidence: extras.evidence ?? {},
  };
}

export function createDefaultCauseNodes(rootLabel = DEFAULT_CAUSE_ROOT_LABEL): CauseMapNode[] {
  return [createCauseNode(rootLabel, null)];
}

export function ensureCauseRoot(nodes: CauseMapNode[] | undefined): CauseMapNode[] {
  const list = nodes ? nodes.map((node) => ({ ...node })) : [];
  if (list.some((node) => node.parentId === null)) return list;
  return [createCauseNode(DEFAULT_CAUSE_ROOT_LABEL, null), ...list];
}

export function causeChildren(nodes: CauseMapNode[], parentId: string): CauseMapNode[] {
  return nodes.filter((node) => node.parentId === parentId);
}

export function causeDescendants(nodes: CauseMapNode[], id: string): CauseMapNode[] {
  const result: CauseMapNode[] = [];
  const visit = (parentId: string) => {
    for (const child of causeChildren(nodes, parentId)) {
      result.push(child);
      visit(child.id);
    }
  };
  visit(id);
  return result;
}

export function causeRoot(nodes: CauseMapNode[]): CauseMapNode {
  const normalized = ensureCauseRoot(nodes);
  return normalized.find((node) => node.parentId === null) ?? normalized[0];
}

export function addCauseChild(nodes: CauseMapNode[], parentId: string, label = t("New cause")): CauseMapNode[] {
  const list = ensureCauseRoot(nodes);
  if (!list.some((node) => node.id === parentId)) return list;
  return [...list, createCauseNode(label, parentId)];
}

export function updateCauseNode(nodes: CauseMapNode[], id: string, patch: Partial<Pick<CauseMapNode, "label" | "detail" | "collapsed" | "edgeType" | "evidence">>): CauseMapNode[] {
  return ensureCauseRoot(nodes).map((node) => node.id === id ? { ...node, ...patch } : node);
}

export function toggleCauseCollapsed(nodes: CauseMapNode[], id: string): CauseMapNode[] {
  return ensureCauseRoot(nodes).map((node) => node.id === id ? { ...node, collapsed: !node.collapsed } : node);
}

export function setCauseEdgeType(nodes: CauseMapNode[], id: string, edgeType: CauseEdgeType): CauseMapNode[] {
  return ensureCauseRoot(nodes).map((node) => node.id === id && node.parentId ? { ...node, edgeType } : node);
}

export function setCauseEvidence(nodes: CauseMapNode[], id: string, evidence: CauseEvidence): CauseMapNode[] {
  return ensureCauseRoot(nodes).map((node) => node.id === id ? { ...node, evidence } : node);
}

export function evidenceCount(evidence?: CauseEvidence): number {
  if (!evidence) return 0;
  return (evidence.assets?.length ?? 0) + (evidence.events?.length ?? 0) + (evidence.timeSeries?.length ?? 0) + (evidence.documents?.length ?? 0) + (evidence.drawingElements?.length ?? 0);
}

export function nodeIsDimmed(nodes: CauseMapNode[], id: string, filter: CauseEdgeType | "all" | undefined): boolean {
  if (!filter || filter === "all") return false;
  const list = ensureCauseRoot(nodes);
  const node = list.find((item) => item.id === id);
  if (!node) return true;
  if (node.parentId && (node.edgeType ?? "causes") === filter) return false;
  if (causeChildren(list, id).some((child) => (child.edgeType ?? "causes") === filter)) return false;
  return true;
}

export function deleteCauseNode(nodes: CauseMapNode[], id: string): CauseMapNode[] {
  const list = ensureCauseRoot(nodes);
  const target = list.find((node) => node.id === id);
  if (!target || target.parentId === null) return list;
  const removed = new Set<string>();
  const visit = (nodeId: string) => {
    removed.add(nodeId);
    for (const child of causeChildren(list, nodeId)) visit(child.id);
  };
  visit(id);
  return list.filter((node) => !removed.has(node.id));
}

function visibleChildren(nodes: CauseMapNode[], parentId: string): CauseMapNode[] {
  const parent = nodes.find((node) => node.id === parentId);
  if (parent?.collapsed) return [];
  return causeChildren(nodes, parentId);
}

function subtreeSpan(nodes: CauseMapNode[], id: string, layout: CauseMapLayout): number {
  const kids = visibleChildren(nodes, id);
  const leaf = layout === "vertical" ? CAUSE_NODE_WIDTH : CAUSE_NODE_HEIGHT;
  if (!kids.length) return leaf;
  const gap = layout === "vertical" ? CAUSE_GAP_X : CAUSE_GAP_Y;
  const childTotal = kids.reduce((sum, child) => sum + subtreeSpan(nodes, child.id, layout), 0) + gap * (kids.length - 1);
  return Math.max(leaf, childTotal);
}

function placeNode(
  nodes: CauseMapNode[],
  id: string,
  originX: number,
  originY: number,
  layout: CauseMapLayout,
  boxes: Map<string, CauseNodeBox>,
): void {
  const node = nodes.find((item) => item.id === id);
  if (!node) return;
  const span = subtreeSpan(nodes, id, layout);
  const isRoot = node.parentId === null;
  const x = layout === "vertical" ? originX + (span - CAUSE_NODE_WIDTH) / 2 : originX;
  const y = layout === "horizontal" ? originY + (span - CAUSE_NODE_HEIGHT) / 2 : originY;
  const kids = causeChildren(nodes, id);
  boxes.set(id, {
    id,
    parentId: node.parentId,
    label: node.label,
    detail: node.detail,
    x,
    y,
    width: CAUSE_NODE_WIDTH,
    height: CAUSE_NODE_HEIGHT,
    isRoot,
    collapsed: Boolean(node.collapsed),
    childCount: kids.length,
    descendantCount: causeDescendants(nodes, id).length,
    edgeType: node.edgeType,
    evidence: node.evidence,
  });
  const visible = visibleChildren(nodes, id);
  if (!visible.length) return;
  if (layout === "vertical") {
    let cursor = originX;
    const childY = y + CAUSE_NODE_HEIGHT + CAUSE_GAP_Y;
    for (const child of visible) {
      const childSpan = subtreeSpan(nodes, child.id, layout);
      placeNode(nodes, child.id, cursor, childY, layout, boxes);
      cursor += childSpan + CAUSE_GAP_X;
    }
  } else {
    let cursor = originY;
    const childX = x + CAUSE_NODE_WIDTH + CAUSE_GAP_X;
    for (const child of visible) {
      const childSpan = subtreeSpan(nodes, child.id, layout);
      placeNode(nodes, child.id, childX, cursor, layout, boxes);
      cursor += childSpan + CAUSE_GAP_Y;
    }
  }
}

function elbowPath(parent: CauseNodeBox, child: CauseNodeBox, layout: CauseMapLayout): string {
  if (layout === "vertical") {
    const x1 = parent.x + parent.width / 2;
    const y1 = parent.y + parent.height;
    const x2 = child.x + child.width / 2;
    const y2 = child.y;
    const midY = (y1 + y2) / 2;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x1.toFixed(1)} ${midY.toFixed(1)} L${x2.toFixed(1)} ${midY.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  const x1 = parent.x + parent.width;
  const y1 = parent.y + parent.height / 2;
  const x2 = child.x;
  const y2 = child.y + child.height / 2;
  const midX = (x1 + x2) / 2;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} L${midX.toFixed(1)} ${y1.toFixed(1)} L${midX.toFixed(1)} ${y2.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function edgeLabelPoint(parent: CauseNodeBox, child: CauseNodeBox, layout: CauseMapLayout): { x: number; y: number } {
  if (layout === "vertical") {
    return { x: (parent.x + parent.width / 2 + child.x + child.width / 2) / 2, y: (parent.y + parent.height + child.y) / 2 };
  }
  return { x: (parent.x + parent.width + child.x) / 2, y: (parent.y + parent.height / 2 + child.y + child.height / 2) / 2 };
}

export interface CauseMapLayoutResult {
  boxes: CauseNodeBox[];
  edges: CauseMapEdge[];
  width: number;
  height: number;
}

export function layoutCauseMap(nodes: CauseMapNode[] | undefined, layout: CauseMapLayout = "horizontal"): CauseMapLayoutResult {
  const list = ensureCauseRoot(nodes);
  const root = causeRoot(list);
  const boxes = new Map<string, CauseNodeBox>();
  placeNode(list, root.id, CAUSE_PAD_X, CAUSE_PAD_Y, layout, boxes);
  const placed = [...boxes.values()];
  const maxX = Math.max(...placed.map((box) => box.x + box.width), CAUSE_NODE_WIDTH);
  const maxY = Math.max(...placed.map((box) => box.y + box.height), CAUSE_NODE_HEIGHT);
  const edges: CauseMapEdge[] = placed
    .filter((box) => box.parentId && boxes.has(box.parentId))
    .map((box) => {
      const style = causeEdgeStyle(box.edgeType);
      const parent = boxes.get(box.parentId as string)!;
      const labelAt = edgeLabelPoint(parent, box, layout);
      return {
        id: `${box.parentId}-${box.id}`,
        fromId: box.parentId as string,
        toId: box.id,
        path: elbowPath(parent, box, layout),
        edgeType: style.id,
        label: style.label,
        color: style.color,
        dasharray: style.dasharray,
        labelX: labelAt.x,
        labelY: labelAt.y,
      };
    });
  return {
    boxes: placed,
    edges,
    width: Math.ceil(maxX + CAUSE_PAD_X),
    height: Math.ceil(maxY + CAUSE_PAD_Y),
  };
}

/** A realistic cooling-water / P-101 investigation used by screenshots and demos. */
export function createPump101CauseMap(): CauseMapNode[] {
  const root = createCauseNode(t("P-101 discharge pressure excursion"), null, t("Cooling-water circulation pump at Area A"));
  const valve = createCauseNode(t("Control valve CV-101 stuck partially closed"), root.id, undefined, {
    edgeType: "causes",
    evidence: { assets: ["P-101"], events: ["EVT-P101-WO-1"] },
  });
  const demand = createCauseNode(t("Increased cooling-water demand"), root.id, undefined, { edgeType: "contributes" });
  const instrument = createCauseNode(t("Instrument / signal issue on PT-101"), root.id, undefined, {
    edgeType: "monitors",
    evidence: { timeSeries: ["P-101-PRESSURE"], events: ["EVT-P101-HI-2"] },
  });
  return [
    root,
    valve,
    createCauseNode(t("Actuator air supply pressure low"), valve.id, undefined, { edgeType: "contributes" }),
    createCauseNode(t("Positioner calibration drift"), valve.id, undefined, { edgeType: "causes" }),
    demand,
    createCauseNode(t("HX-201 fouling reduced heat transfer"), demand.id, undefined, { edgeType: "causes", evidence: { assets: ["P-101"] } }),
    createCauseNode(t("Parallel cooling train offline"), demand.id, undefined, { edgeType: "feeds" }),
    instrument,
    createCauseNode(t("Impulse line partially blocked"), instrument.id, undefined, { edgeType: "measures" }),
  ];
}

export const CAUSE_WIDGET_HEADER = 42;

export function causeMapWidgetSize(layout: CauseMapLayoutResult): { width: number; height: number } {
  return {
    width: Math.max(layout.width, 360),
    height: layout.height + CAUSE_TOOLBAR_HEIGHT + CAUSE_WIDGET_HEADER,
  };
}
