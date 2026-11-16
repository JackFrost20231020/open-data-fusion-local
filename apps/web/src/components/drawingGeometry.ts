export interface WorldBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

export function parsePointList(value: unknown): Point[] {
  if (!value) return [];
  let raw: unknown = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  const points: Point[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = Number((item as { x?: unknown }).x);
    const y = Number((item as { y?: unknown }).y);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  return points;
}

export function matrixTransform(matrix: string | null | undefined): string | undefined {
  if (!matrix) return undefined;
  const parts = matrix.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean);
  return parts.length === 6 ? `matrix(${parts.join(" ")})` : undefined;
}

export function inflate(box: WorldBBox, pad: number): WorldBBox {
  return { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
}

export function intersectsBox(a: WorldBBox, b: WorldBBox): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

export function containsPoint(box: WorldBBox, point: Point): boolean {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
}

export function boxArea(box: WorldBBox): number {
  return Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxY - box.minY);
}

export function boxCenter(box: WorldBBox): Point {
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/** Minimum separation between two boxes; 0 if they touch or overlap. */
export function boxGap(a: WorldBBox, b: WorldBBox): number {
  const dx = a.maxX < b.minX ? b.minX - a.maxX : b.maxX < a.minX ? a.minX - b.maxX : 0;
  const dy = a.maxY < b.minY ? b.minY - a.maxY : b.maxY < a.minY ? a.minY - b.maxY : 0;
  if (dx === 0 && dy === 0) return 0;
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return Math.hypot(dx, dy);
}

export function distanceToBox(point: Point, box: WorldBBox): number {
  const dx = point.x < box.minX ? box.minX - point.x : point.x > box.maxX ? point.x - box.maxX : 0;
  const dy = point.y < box.minY ? box.minY - point.y : point.y > box.maxY ? point.y - box.maxY : 0;
  return Math.hypot(dx, dy);
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function distanceToPolyline(point: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, distanceToSegment(point, points[index - 1], points[index]));
  }
  return best;
}

export function unionBoxes(boxes: WorldBBox[]): WorldBBox | null {
  if (!boxes.length) return null;
  return boxes.reduce((acc, box) => ({
    minX: Math.min(acc.minX, box.minX),
    minY: Math.min(acc.minY, box.minY),
    maxX: Math.max(acc.maxX, box.maxX),
    maxY: Math.max(acc.maxY, box.maxY),
  }));
}

export function viewBoxString(box: WorldBBox): string {
  return `${box.minX} ${box.minY} ${Math.max(1, box.maxX - box.minX)} ${Math.max(1, box.maxY - box.minY)}`;
}

export interface HitTarget {
  nodeId: string;
  kind: "box" | "polyline";
  box?: WorldBBox;
  points?: Point[];
}

const MIN_HIT = 8;

export function hitTargetForElement(item: {
  nodeId: string;
  drawingMethod?: string | null;
  points?: unknown;
  worldBBox?: WorldBBox | null;
}): HitTarget | null {
  if (item.drawingMethod === "PIPE_SEGMENT") {
    const points = parsePointList(item.points);
    if (points.length >= 2) return { nodeId: item.nodeId, kind: "polyline", points };
  }
  if (item.worldBBox) {
    const box = item.worldBBox;
    const width = Math.max(MIN_HIT, box.maxX - box.minX);
    const height = Math.max(MIN_HIT, box.maxY - box.minY);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    return {
      nodeId: item.nodeId,
      kind: "box",
      box: { minX: cx - width / 2, minY: cy - height / 2, maxX: cx + width / 2, maxY: cy + height / 2 },
    };
  }
  return null;
}

export type LabelAnchor = "start" | "middle" | "end";
export type LabelBaseline = "alphabetic" | "middle";
export type LabelSlot = "inside" | "below" | "above" | "left" | "right";

export interface LabelCandidate {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  anchor?: LabelAnchor;
  baseline?: LabelBaseline;
  slot?: LabelSlot;
}

export function labelWorldBox(label: LabelCandidate): WorldBBox {
  const anchor = label.anchor ?? "start";
  const minX = anchor === "middle"
    ? label.x - label.width / 2
    : anchor === "end"
      ? label.x - label.width
      : label.x;
  const mid = (label.baseline ?? "alphabetic") === "middle";
  const minY = mid ? label.y - label.height / 2 : label.y - label.height;
  const maxY = mid ? label.y + label.height / 2 : label.y + 2;
  return { minX, minY, maxX: minX + label.width, maxY };
}

export function cullLabels(labels: LabelCandidate[], view: WorldBBox | null): LabelCandidate[] {
  if (!view) return [];
  const viewWidth = Math.max(1, view.maxX - view.minX);
  const density = viewWidth; // world units; larger means more zoomed out
  const kept: LabelCandidate[] = [];
  const ranked = [...labels].sort((a, b) => b.priority - a.priority);
  for (const label of ranked) {
    // Drop low-priority labels when zoomed far out.
    if (density > 2800 && label.priority < 30) continue;
    if (density > 1600 && label.priority < 20) continue;
    const box = labelWorldBox(label);
    const overlaps = kept.some((other) => intersectsBox(box, labelWorldBox(other)));
    if (!overlaps) kept.push(label);
  }
  return kept;
}

export function eventTargetIsDrawingStage(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".industrial-drawing-stage"));
}
