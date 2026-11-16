import { t } from "../i18n";
export type ThresholdDirection = "high" | "low";

export interface CanvasThresholdRule {
  id: string;
  seriesExternalId?: string;
  direction: ThresholdDirection;
  value: number;
  color: string;
  label?: string;
}

export const DEFAULT_HIGH_THRESHOLD_COLOR = "#d13b2e";
export const DEFAULT_LOW_THRESHOLD_COLOR = "#d07a18";

export const CHART_PLOT = { left: 12, right: 348, top: 30, bottom: 142, width: 336, height: 112 };

export function createThresholdRule(
  direction: ThresholdDirection,
  value: number,
  options: { seriesExternalId?: string; color?: string; label?: string } = {},
): CanvasThresholdRule {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: `threshold-${suffix}`,
    direction,
    value,
    color: options.color ?? (direction === "high" ? DEFAULT_HIGH_THRESHOLD_COLOR : DEFAULT_LOW_THRESHOLD_COLOR),
    ...(options.seriesExternalId ? { seriesExternalId: options.seriesExternalId } : {}),
    ...(options.label ? { label: options.label } : {}),
  };
}

export function isBreaching(value: number, rule: CanvasThresholdRule): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(rule.value)) return false;
  return rule.direction === "high" ? value >= rule.value : value <= rule.value;
}

export function rulesForSeries(rules: CanvasThresholdRule[] | undefined, seriesExternalId: string): CanvasThresholdRule[] {
  return (rules ?? []).filter((rule) => !rule.seriesExternalId || rule.seriesExternalId === seriesExternalId);
}

export function scaleY(value: number, min: number, max: number): number {
  const spread = Math.max(max - min, 1e-6);
  return CHART_PLOT.bottom - ((value - min) / spread) * CHART_PLOT.height;
}

export function valueDomain(values: number[], rules: CanvasThresholdRule[] = []): { min: number; max: number } {
  const domain = [...values, ...rules.map((rule) => rule.value)].filter((value) => Number.isFinite(value));
  if (!domain.length) return { min: 0, max: 1 };
  const min = Math.min(...domain);
  const max = Math.max(...domain);
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.06;
  return { min: min - pad, max: max + pad };
}

export interface SeriesPoint {
  timestamp?: string;
  value: number;
}

export interface ThresholdEvaluation {
  anyWindow: boolean;
  latest: boolean;
  breachedPointCount: number;
  colors: string[];
  rules: Array<{ rule: CanvasThresholdRule; windowCount: number; latest: boolean }>;
}

export function evaluateThresholds(
  series: Array<{ externalId: string; points: SeriesPoint[] }>,
  rules: CanvasThresholdRule[] | undefined,
): ThresholdEvaluation {
  const list = rules ?? [];
  const evaluated = list.map((rule) => {
    const targets = series.filter((item) => !rule.seriesExternalId || item.externalId === rule.seriesExternalId);
    let windowCount = 0;
    let latest = false;
    for (const item of targets) {
      for (const point of item.points) {
        if (isBreaching(point.value, rule)) windowCount += 1;
      }
      const last = item.points.at(-1);
      if (last && isBreaching(last.value, rule)) latest = true;
    }
    return { rule, windowCount, latest };
  });
  const active = evaluated.filter((item) => item.windowCount > 0);
  return {
    anyWindow: active.length > 0,
    latest: evaluated.some((item) => item.latest),
    breachedPointCount: evaluated.reduce((sum, item) => sum + item.windowCount, 0),
    colors: [...new Set(active.map((item) => item.rule.color))],
    rules: evaluated,
  };
}

export function breachColorForValue(value: number, rules: CanvasThresholdRule[]): string | undefined {
  const hit = rules.find((rule) => isBreaching(value, rule));
  return hit?.color;
}

export function thresholdLabel(rule: CanvasThresholdRule, unit?: string | null): string {
  const raw = rule.label ?? (rule.direction === "high" ? "High" : "Low");
  const name = t(raw);
  const unitSuffix = unit ? ` ${unit}` : "";
  return `${name} ${rule.value}${unitSuffix}`;
}
