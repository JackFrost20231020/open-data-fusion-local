import { describe, expect, it } from "vitest";
import { bindingsFromOptions, sourceLabelForBindings, telemetryWindow, TIME_RANGE_MS, widgetSeriesBindings } from "./canvasTelemetry";
import { createWidget } from "./industrialCanvas";
import { t } from "../i18n";

describe("canvas telemetry helpers", () => {
  it("maps named time ranges to ISO windows", () => {
    const window = telemetryWindow("24h");
    const span = Date.parse(window.to) - Date.parse(window.from);
    expect(span).toBe(TIME_RANGE_MS["24h"]);
    expect(telemetryWindow("7d").from < telemetryWindow("1h").from).toBe(true);
  });

  it("reads persisted series bindings from a widget", () => {
    const widget = createWidget("timeSeries", { x: 0, y: 0 }, 1);
    expect(widgetSeriesBindings(widget)).toEqual([]);
    widget.data.connectedSeries = [
      { externalId: "P-101-PRESSURE", assetExternalId: "P-101", name: t("P-101 discharge pressure"), unit: "psi" },
    ];
    expect(widgetSeriesBindings(widget)[0]?.externalId).toBe("P-101-PRESSURE");
  });

  it("labels a connected source from selected series", () => {
    const options = [
      { externalId: "P-101-PRESSURE", assetExternalId: "P-101", assetName: "Pump P-101", name: t("P-101 discharge pressure"), unit: "psi", description: null },
      { externalId: "P-101-TEMP", assetExternalId: "P-101", assetName: "Pump P-101", name: t("P-101 bearing temperature"), unit: "°C", description: null },
    ];
    expect(sourceLabelForBindings(bindingsFromOptions(options.slice(0, 1)))).toBe(t("P-101 discharge pressure"));
    expect(sourceLabelForBindings(bindingsFromOptions(options))).toBe(t("{count} time series", { count: 2 }));
  });
});
