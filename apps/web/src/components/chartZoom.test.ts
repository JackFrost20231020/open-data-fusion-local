import { describe, expect, it } from "vitest";
import { CHART_PLOT } from "./chartThresholds";
import {
  chooseBucketMs,
  formatDuration,
  padEventWindow,
  RAW_POINT_WINDOW_MS,
  telemetryQueryWindow,
  windowFromPlotX,
  xForTime,
  zoomInWindow,
  zoomOutWindow,
} from "./chartZoom";

const window = { from: "2026-11-12T00:00:00.000Z", to: "2026-11-13T00:00:00.000Z" };

describe("chart zoom and aggregation helpers", () => {
  it("formats durations in Chinese units", () => {
    expect(formatDuration(15_000)).toBe("15 秒");
    expect(formatDuration(2 * 60_000)).toBe("2 分钟");
    expect(formatDuration(2 * 3_600_000)).toBe("2 小时");
    expect(formatDuration(2 * 3_600_000 + 15 * 60_000)).toBe("2 小时 15 分钟");
    expect(formatDuration(2 * 24 * 3_600_000)).toBe("2 天");
  });

  it("uses raw points for short windows and buckets for wide ones", () => {
    expect(chooseBucketMs(window.from, new Date(Date.parse(window.from) + RAW_POINT_WINDOW_MS).toISOString())).toBeNull();
    const day = chooseBucketMs(window.from, window.to);
    expect(day).toBeGreaterThanOrEqual(10 * 60_000);
    expect(day).toBeLessThanOrEqual(30 * 60_000);
    const month = chooseBucketMs(window.from, "2026-12-12T00:00:00.000Z");
    expect(month).toBeGreaterThanOrEqual(3_600_000);
  });

  it("maps a dragged region onto the current time window", () => {
    const left = CHART_PLOT.left;
    const mid = CHART_PLOT.left + CHART_PLOT.width / 2;
    const result = windowFromPlotX(left, mid, window);
    expect(result).not.toBeNull();
    expect(Date.parse(result!.from)).toBe(Date.parse(window.from));
    expect(Date.parse(result!.to)).toBe(Date.parse("2026-11-12T12:00:00.000Z"));
    expect(windowFromPlotX(left, left + 2, window)).toBeNull();
  });

  it("zooms in and out around the window center, staying inside the outer range", () => {
    const inner = zoomInWindow(window);
    expect(Date.parse(inner.to) - Date.parse(inner.from)).toBe(12 * 3_600_000);
    const back = zoomOutWindow(inner, window);
    expect(back).toEqual(window);
    const query = telemetryQueryWindow("24h", inner);
    expect(query).toEqual(inner);
    expect(telemetryQueryWindow("24h")).not.toEqual(inner);
  });

  it("places timestamps on the plot and pads an event window", () => {
    const mid = xForTime(Date.parse("2026-11-12T12:00:00.000Z"), window);
    expect(mid).toBeCloseTo(CHART_PLOT.left + CHART_PLOT.width / 2, 5);
    const padded = padEventWindow("2026-11-12T14:00:00.000Z", "2026-11-12T15:00:00.000Z", 30 * 60_000);
    expect(padded.from).toBe("2026-11-12T13:30:00.000Z");
    expect(padded.to).toBe("2026-11-12T15:30:00.000Z");
  });
});
