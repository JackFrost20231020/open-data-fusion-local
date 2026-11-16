import { CHART_PLOT } from "./chartThresholds";
import { telemetryWindow } from "./canvasTelemetry";

export interface TimeWindow {
  from: string;
  to: string;
}

/** Windows at or below this span are fetched as raw points instead of buckets. */
export const RAW_POINT_WINDOW_MS = 3 * 60 * 60 * 1000;
export const TARGET_BUCKETS = 120;
export const MIN_ZOOM_MS = 5 * 60 * 1000;
export const MIN_DRAG_PX = 6;

const NICE_BUCKET_MS = [
  1_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000,
  1_800_000, 3_600_000, 7_200_000, 14_400_000, 21_600_000, 43_200_000, 86_400_000,
];

export function parseWindow(window: TimeWindow): { from: number; to: number; span: number } {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const span = Math.max(to - from, 1);
  return { from, to, span };
}

export function telemetryQueryWindow(timeRange?: string, zoomWindow?: TimeWindow | null): TimeWindow {
  if (zoomWindow?.from && zoomWindow?.to && Date.parse(zoomWindow.to) > Date.parse(zoomWindow.from)) {
    return { from: zoomWindow.from, to: zoomWindow.to };
  }
  return telemetryWindow(timeRange);
}

export function chooseBucketMs(from: string, to: string): number | null {
  const span = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(span) || span <= RAW_POINT_WINDOW_MS) return null;
  const raw = span / TARGET_BUCKETS;
  return NICE_BUCKET_MS.find((value) => value >= raw) ?? NICE_BUCKET_MS[NICE_BUCKET_MS.length - 1];
}

export function formatDuration(ms: number): string {
  const abs = Math.max(0, Math.round(ms));
  if (abs < 60_000) return `${Math.max(1, Math.round(abs / 1000))} 秒`;
  if (abs < 3_600_000) return `${Math.max(1, Math.round(abs / 60_000))} 分钟`;
  if (abs < 24 * 3_600_000) {
    const hours = Math.floor(abs / 3_600_000);
    const minutes = Math.round((abs - hours * 3_600_000) / 60_000);
    return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分钟`;
  }
  const days = Math.floor(abs / (24 * 3_600_000));
  const hours = Math.round((abs - days * 24 * 3_600_000) / 3_600_000);
  return hours === 0 ? `${days} 天` : `${days} 天 ${hours} 小时`;
}

export function xForTime(timestamp: number, window: TimeWindow, plot = CHART_PLOT): number {
  const { from, span } = parseWindow(window);
  return plot.left + ((timestamp - from) / span) * plot.width;
}

export function timeForX(x: number, window: TimeWindow, plot = CHART_PLOT): number {
  const { from, span } = parseWindow(window);
  const clamped = Math.min(plot.left + plot.width, Math.max(plot.left, x));
  return from + ((clamped - plot.left) / plot.width) * span;
}

export function windowFromPlotX(
  startX: number,
  endX: number,
  window: TimeWindow,
  plot = CHART_PLOT,
): TimeWindow | null {
  if (Math.abs(endX - startX) < MIN_DRAG_PX) return null;
  const t1 = timeForX(startX, window, plot);
  const t2 = timeForX(endX, window, plot);
  const from = Math.min(t1, t2);
  const to = Math.max(t1, t2);
  if (to - from < MIN_ZOOM_MS) {
    const mid = (from + to) / 2;
    const half = MIN_ZOOM_MS / 2;
    return { from: new Date(mid - half).toISOString(), to: new Date(mid + half).toISOString() };
  }
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

export function zoomInWindow(window: TimeWindow, factor = 0.5): TimeWindow {
  const { from, to, span } = parseWindow(window);
  const next = Math.max(span * factor, MIN_ZOOM_MS);
  const mid = (from + to) / 2;
  return { from: new Date(mid - next / 2).toISOString(), to: new Date(mid + next / 2).toISOString() };
}

export function zoomOutWindow(window: TimeWindow, outer?: TimeWindow, factor = 2): TimeWindow {
  const { from, to, span } = parseWindow(window);
  const mid = (from + to) / 2;
  let nextSpan = span * factor;
  let nextFrom = mid - nextSpan / 2;
  let nextTo = mid + nextSpan / 2;
  if (outer) {
    const bounds = parseWindow(outer);
    nextFrom = Math.max(bounds.from, nextFrom);
    nextTo = Math.min(bounds.to, nextTo);
    if (nextTo - nextFrom < Math.min(nextSpan, bounds.span)) {
      if (nextFrom <= bounds.from) nextTo = Math.min(bounds.to, nextFrom + nextSpan);
      if (nextTo >= bounds.to) nextFrom = Math.max(bounds.from, nextTo - nextSpan);
    }
  }
  return { from: new Date(nextFrom).toISOString(), to: new Date(nextTo).toISOString() };
}

export function padEventWindow(startTime: string, endTime?: string | null, padMs = 30 * 60 * 1000): TimeWindow {
  const start = Date.parse(startTime);
  const end = endTime ? Date.parse(endTime) : start;
  const from = Math.min(start, end) - padMs;
  const to = Math.max(start, end) + padMs;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
