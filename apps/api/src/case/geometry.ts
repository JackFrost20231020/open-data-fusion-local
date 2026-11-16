export interface Point {
  x: number;
  y: number;
}

export interface WorldBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** SVG matrix(a,b,c,d,e,f) stored as "a,b,c,d,e,f". */
export function parseMatrix(value: string | null | undefined): number[] | null {
  if (!value) return null;
  const parts = value.split(/[,\s]+/).map((part) => Number(part)).filter((n) => Number.isFinite(n));
  return parts.length === 6 ? parts : null;
}

export function applyMatrix(matrix: number[] | null, point: Point): Point {
  if (!matrix || matrix.length < 6) return point;
  const a = matrix[0]!;
  const b = matrix[1]!;
  const c = matrix[2]!;
  const d = matrix[3]!;
  const e = matrix[4]!;
  const f = matrix[5]!;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

export function parseJsonPoints(value: unknown): Point[] {
  if (!value) return [];
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const x = Number((item as { x?: unknown }).x);
      const y = Number((item as { y?: unknown }).y);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })
    .filter((point): point is Point => point != null);
}

export function bboxFromPoints(points: Point[]): WorldBBox | null {
  const first = points[0];
  if (!first) return null;
  let minX = first.x, minY = first.y, maxX = first.x, maxY = first.y;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

export function worldBBoxForInstance(props: {
  matrix?: string | null;
  boundingBox?: unknown;
  points?: unknown;
  connectPoint?: unknown;
}): WorldBBox | null {
  const matrix = parseMatrix(props.matrix ?? null);
  const local = parseJsonPoints(props.boundingBox);
  if (local.length) return bboxFromPoints(local.map((point) => applyMatrix(matrix, point)));
  const pipe = parseJsonPoints(props.points);
  if (pipe.length) return bboxFromPoints(pipe.map((point) => applyMatrix(matrix, point)));
  return null;
}
