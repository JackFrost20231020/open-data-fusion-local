import {
  boxArea,
  boxCenter,
  boxGap,
  containsPoint,
  cullLabels,
  distanceToBox,
  distanceToPolyline,
  hitTargetForElement,
  inflate,
  intersectsBox,
  labelWorldBox,
  type HitTarget,
  type LabelCandidate,
  type LabelSlot,
  type Point,
  type WorldBBox,
} from "./drawingGeometry";

export const LABEL_FONT_SIZE = 9;
export const LABEL_CHAR_WIDTH = 0.62;
export const PIPE_HIT_DISTANCE = 5;
export const NEARBY_GAP = 20;
export const NEAR_MISS_DISTANCE = 8;
const SLOT_ORDER: LabelSlot[] = ["inside", "below", "above", "left", "right"];

export interface LabeledElement {
  nodeId: string;
  drawingMethod?: string | null;
  worldBBox?: WorldBBox | null;
  shortCode?: string | null;
  deviceName?: string | null;
  equipCode?: string | null;
  name?: string | null;
}

/** Compact in-drawing tag derived from existing fields. Does not invent or rename tags. */
export function compactVisibleLabel(item: {
  shortCode?: string | null;
  deviceName?: string | null;
  equipCode?: string | null;
  name?: string | null;
}): string {
  const device = (item.deviceName ?? "").trim();
  if (device && device.length <= 12) return device;
  const short = (item.shortCode ?? "").trim();
  if (short) {
    const parts = short.split("-").filter(Boolean);
    const last = parts[parts.length - 1] ?? short;
    if (last.length <= 12 && /[A-Za-z]/.test(last) && /\d/.test(last)) return last;
    if (short.length <= 16) return short;
  }
  const equip = (item.equipCode ?? "").trim();
  if (equip && equip.length <= 16) return equip;
  return (item.name ?? "").trim();
}

export function inspectorTitle(item: {
  shortCode?: string | null;
  equipCode?: string | null;
  deviceName?: string | null;
  name?: string | null;
  nodeId: string;
}): string {
  return item.shortCode || item.equipCode || item.deviceName || item.name || item.nodeId;
}

export function estimateLabelSize(text: string, fontSize = LABEL_FONT_SIZE): { width: number; height: number } {
  return {
    width: Math.max(fontSize, text.length * fontSize * LABEL_CHAR_WIDTH),
    height: fontSize + 1,
  };
}

function slotPlacement(owner: WorldBBox, size: { width: number; height: number }, slot: LabelSlot): Pick<LabelCandidate, "x" | "y" | "anchor" | "baseline" | "width" | "height" | "slot"> {
  const center = boxCenter(owner);
  const gap = 3;
  switch (slot) {
    case "inside":
      return { x: center.x, y: center.y, anchor: "middle", baseline: "middle", slot, ...size };
    case "below":
      return { x: center.x, y: owner.maxY + gap + size.height / 2, anchor: "middle", baseline: "middle", slot, ...size };
    case "above":
      return { x: center.x, y: owner.minY - gap - size.height / 2, anchor: "middle", baseline: "middle", slot, ...size };
    case "left":
      return { x: owner.minX - gap, y: center.y, anchor: "end", baseline: "middle", slot, ...size };
    case "right":
      return { x: owner.maxX + gap, y: center.y, anchor: "start", baseline: "middle", slot, ...size };
  }
}

function conflictsWithForeignHits(box: WorldBBox, ownerId: string, hits: Array<{ nodeId: string; box: WorldBBox }>): boolean {
  return hits.some((hit) => hit.nodeId !== ownerId && intersectsBox(box, hit.box));
}

export function placeVisibleLabels(
  items: Array<LabeledElement & { priority?: number }>,
  view: WorldBBox | null,
  foreignHits?: Array<{ nodeId: string; box: WorldBBox }>,
): LabelCandidate[] {
  const hits = foreignHits ?? items.flatMap((item) => {
    const hit = hitTargetForElement(item);
    return hit?.kind === "box" && hit.box ? [{ nodeId: item.nodeId, box: hit.box }] : [];
  });
  const drafts: LabelCandidate[] = [];
  for (const item of items) {
    if (item.drawingMethod === "PIPE_SEGMENT" || !item.worldBBox) continue;
    const text = compactVisibleLabel(item);
    if (!text) continue;
    const size = estimateLabelSize(text);
    let chosen: LabelCandidate | null = null;
    for (const slot of SLOT_ORDER) {
      const placement = slotPlacement(item.worldBBox, size, slot);
      const candidate: LabelCandidate = {
        id: item.nodeId,
        text,
        priority: item.priority ?? 10,
        ...placement,
      };
      if (!conflictsWithForeignHits(labelWorldBox(candidate), item.nodeId, hits)) {
        chosen = candidate;
        break;
      }
    }
    drafts.push(chosen ?? {
      id: item.nodeId,
      text,
      priority: item.priority ?? 10,
      ...slotPlacement(item.worldBBox, size, "inside"),
    });
  }
  return cullLabels(drafts, view);
}

export interface DrawingHitItem {
  nodeId: string;
  kind: "box" | "polyline";
  box?: WorldBBox;
  points?: Point[];
  labelBox?: WorldBBox;
  area?: number;
  label?: string;
}

export type HitReason = "label" | "box" | "pipe" | "nearby" | "none";

export interface DrawingHitCandidate {
  nodeId: string;
  reason: Exclude<HitReason, "none">;
  area?: number;
}

export interface DrawingHitResult {
  primaryId: string | null;
  reason: HitReason;
  candidates: DrawingHitCandidate[];
}

function uniqueCandidates(rows: DrawingHitCandidate[]): DrawingHitCandidate[] {
  const seen = new Set<string>();
  const out: DrawingHitCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.nodeId)) continue;
    seen.add(row.nodeId);
    out.push(row);
  }
  return out;
}

export function buildHitModel(
  items: Array<LabeledElement & { points?: unknown }>,
  labels: LabelCandidate[] = [],
): DrawingHitItem[] {
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const model: DrawingHitItem[] = [];
  for (const item of items) {
    const hit = hitTargetForElement(item);
    if (!hit) continue;
    const label = labelById.get(item.nodeId);
    model.push({
      nodeId: item.nodeId,
      kind: hit.kind,
      box: hit.box,
      points: hit.points,
      labelBox: label ? labelWorldBox(label) : undefined,
      area: hit.box ? boxArea(hit.box) : undefined,
      label: label?.text ?? compactVisibleLabel(item) ?? undefined,
    });
  }
  return model;
}

export function resolveDrawingHit(
  point: Point,
  items: DrawingHitItem[],
  options?: { pipeDistance?: number; nearMiss?: number },
): DrawingHitResult {
  const pipeDistance = options?.pipeDistance ?? PIPE_HIT_DISTANCE;
  const nearMiss = options?.nearMiss ?? NEAR_MISS_DISTANCE;

  const labeled = items.filter((item) => item.labelBox && containsPoint(item.labelBox, point));
  const boxed = items.filter((item) => item.kind === "box" && item.box && containsPoint(item.box, point));
  const piped = items.filter((item) => (
    item.kind === "polyline"
    && item.points
    && item.points.length >= 2
    && distanceToPolyline(point, item.points) <= pipeDistance
  ));

  if (labeled.length) {
    const ranked = [...labeled].sort((a, b) => {
      const aInside = a.box && containsPoint(a.box, point) ? 0 : 1;
      const bInside = b.box && containsPoint(b.box, point) ? 0 : 1;
      if (aInside !== bInside) return aInside - bInside;
      const aArea = a.labelBox ? boxArea(a.labelBox) : Number.POSITIVE_INFINITY;
      const bArea = b.labelBox ? boxArea(b.labelBox) : Number.POSITIVE_INFINITY;
      return aArea - bArea;
    });
    return {
      primaryId: ranked[0].nodeId,
      reason: "label",
      candidates: uniqueCandidates([
        ...ranked.map((item) => ({ nodeId: item.nodeId, reason: "label" as const })),
        ...boxed.map((item) => ({ nodeId: item.nodeId, reason: "box" as const, area: item.area })),
      ]),
    };
  }

  if (boxed.length) {
    const ranked = [...boxed].sort((a, b) => {
      const aArea = a.area ?? Number.POSITIVE_INFINITY;
      const bArea = b.area ?? Number.POSITIVE_INFINITY;
      if (aArea !== bArea) return aArea - bArea;
      const aCenter = a.box ? boxCenter(a.box) : point;
      const bCenter = b.box ? boxCenter(b.box) : point;
      return Math.hypot(aCenter.x - point.x, aCenter.y - point.y) - Math.hypot(bCenter.x - point.x, bCenter.y - point.y);
    });
    return {
      primaryId: ranked[0].nodeId,
      reason: "box",
      candidates: uniqueCandidates(ranked.map((item) => ({ nodeId: item.nodeId, reason: "box" as const, area: item.area }))),
    };
  }

  if (piped.length) {
    const ranked = [...piped].sort((a, b) => (
      distanceToPolyline(point, a.points ?? []) - distanceToPolyline(point, b.points ?? [])
    ));
    return {
      primaryId: ranked[0].nodeId,
      reason: "pipe",
      candidates: uniqueCandidates(ranked.map((item) => ({ nodeId: item.nodeId, reason: "pipe" as const }))),
    };
  }

  const nearBoxes = items.filter((item) => item.kind === "box" && item.box && distanceToBox(point, item.box) <= nearMiss);
  if (nearBoxes.length) {
    const ranked = [...nearBoxes].sort((a, b) => distanceToBox(point, a.box!) - distanceToBox(point, b.box!));
    return {
      primaryId: ranked[0].nodeId,
      reason: "nearby",
      candidates: uniqueCandidates(ranked.map((item) => ({ nodeId: item.nodeId, reason: "nearby" as const, area: item.area }))),
    };
  }

  return { primaryId: null, reason: "none", candidates: [] };
}

export function spatialNeighbors(
  selectedId: string,
  items: DrawingHitItem[],
  maxGap = NEARBY_GAP,
): string[] {
  const selected = items.find((item) => item.nodeId === selectedId && item.box);
  if (!selected?.box) return [];
  return items
    .filter((item) => item.nodeId !== selectedId && item.kind === "box" && item.box && boxGap(selected.box!, item.box) <= maxGap)
    .sort((a, b) => boxGap(selected.box!, a.box!) - boxGap(selected.box!, b.box!))
    .map((item) => item.nodeId);
}

/** Dropdown / bare page change clears the selection. An explicit jump target is kept. */
export function selectionAfterPageChange(explicitNodeId?: string | null): string | undefined {
  return explicitNodeId || undefined;
}

export function shouldKeepInstanceResult(args: {
  requestId: number;
  currentRequestId: number;
  aborted: boolean;
  instanceId: string;
  expectedId: string;
  instancePage?: string | null;
  currentPage?: string | null;
}): boolean {
  if (args.aborted || args.requestId !== args.currentRequestId) return false;
  if (args.instanceId !== args.expectedId) return false;
  if (args.instancePage && args.currentPage && args.instancePage !== args.currentPage) return false;
  return true;
}

export function hitTargetBoxes(items: Array<Parameters<typeof hitTargetForElement>[0]>): Array<{ nodeId: string; box: WorldBBox }> {
  return items.flatMap((item) => {
    const hit: HitTarget | null = hitTargetForElement(item);
    return hit?.kind === "box" && hit.box ? [{ nodeId: hit.nodeId, box: hit.box }] : [];
  });
}
