import { t } from "../i18n";
import { getAssetTelemetry, getAssetTelemetryAggregate, type ProjectTimeSeriesOption } from "../lib/api";
import type { PlatformContext, TelemetryBucket, TelemetryPoint, TelemetryResponse } from "../types";
import type { CanvasSeriesBinding, CanvasWidget } from "./industrialCanvas";
import { chooseBucketMs, telemetryQueryWindow, type TimeWindow } from "./chartZoom";

export const TIME_RANGE_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function telemetryWindow(timeRange = "24h"): { from: string; to: string } {
  const to = Date.now();
  const span = TIME_RANGE_MS[timeRange] ?? TIME_RANGE_MS["24h"];
  return {
    from: new Date(to - span).toISOString(),
    to: new Date(to).toISOString(),
  };
}

export function widgetSeriesBindings(widget?: CanvasWidget | null): CanvasSeriesBinding[] {
  if (!widget?.data.connectedSeries?.length) return [];
  return widget.data.connectedSeries;
}

export function usesProjectDataPicker(kind: CanvasWidget["kind"]): boolean {
  return kind === "chart" || kind === "timeSeries" || kind === "asset";
}

export function bindingsFromOptions(options: ProjectTimeSeriesOption[]): CanvasSeriesBinding[] {
  return options.map((option) => ({
    externalId: option.externalId,
    assetExternalId: option.assetExternalId,
    name: option.name,
    unit: option.unit,
  }));
}

export function sourceLabelForBindings(bindings: CanvasSeriesBinding[]): string {
  if (bindings.length === 1) return bindings[0].name;
  if (bindings.length > 1) return t("{count} time series", { count: bindings.length });
  return t("Connected source");
}

function bucketsAsPoints(buckets: TelemetryBucket[] | undefined): TelemetryPoint[] {
  return (buckets ?? []).map((bucket) => ({
    timestamp: bucket.timestamp,
    value: bucket.avg ?? bucket.value,
    quality: bucket.quality ?? "good",
    min: bucket.min,
    max: bucket.max,
    avg: bucket.avg ?? bucket.value,
    count: bucket.count,
  }));
}

export async function fetchTelemetryForBindings(
  context: PlatformContext,
  bindings: CanvasSeriesBinding[],
  timeRange: string | undefined,
  signal?: AbortSignal,
  zoomWindow?: TimeWindow | null,
): Promise<TelemetryResponse> {
  const window = telemetryQueryWindow(timeRange, zoomWindow);
  const bucketMs = chooseBucketMs(window.from, window.to);
  const ids = new Set(bindings.map((binding) => binding.externalId));
  const byAsset = new Map<string, CanvasSeriesBinding[]>();
  for (const binding of bindings) {
    const group = byAsset.get(binding.assetExternalId) ?? [];
    group.push(binding);
    byAsset.set(binding.assetExternalId, group);
  }

  const pages = await Promise.all([...byAsset.entries()].map(([assetExternalId, group]) => {
    const query = {
      ...window,
      limit: 5000,
      ...(group.length === 1 ? { timeSeriesExternalId: group[0].externalId } : {}),
    };
    return bucketMs
      ? getAssetTelemetryAggregate(context, assetExternalId, { ...query, bucketMs, aggregation: "avg" }, signal)
      : getAssetTelemetry(context, assetExternalId, query, signal);
  }));

  const series = pages.flatMap((page) => page.series.filter((item) => ids.has(item.externalId)).map((item) => {
    const buckets = (item as { buckets?: TelemetryBucket[] }).buckets;
    const points = bucketMs ? bucketsAsPoints(buckets) : item.points;
    return { ...item, points, buckets };
  }));
  const assetExternalId = bindings[0]?.assetExternalId ?? "";
  return { assetExternalId, range: window, bucketMs: bucketMs ?? null, mode: bucketMs ? "aggregate" : "raw", series };
}
