import { t } from "../i18n";
import { describe, expect, it } from "vitest";
import {
  breachColorForValue,
  createThresholdRule,
  evaluateThresholds,
  isBreaching,
  scaleY,
  thresholdLabel,
  valueDomain,
} from "./chartThresholds";

const high = createThresholdRule("high", 115, { color: "#d13b2e", seriesExternalId: "P-101-PRESSURE" });
const low = createThresholdRule("low", 100, { color: "#d07a18", seriesExternalId: "P-101-PRESSURE" });

describe("chart threshold rules", () => {
  it("detects high and low breaches, including equality", () => {
    expect(isBreaching(116.9, high)).toBe(true);
    expect(isBreaching(115, high)).toBe(true);
    expect(isBreaching(114.9, high)).toBe(false);
    expect(isBreaching(96, low)).toBe(true);
    expect(isBreaching(100, low)).toBe(true);
    expect(isBreaching(101, low)).toBe(false);
  });

  it("evaluates window and latest breaches on a real-looking P-101 series", () => {
    const points = [
      { timestamp: "2026-11-11T16:00:00.000Z", value: 109.9 },
      { timestamp: "2026-11-11T20:00:00.000Z", value: 96.0 },
      { timestamp: "2026-11-12T08:00:00.000Z", value: 112.4 },
      { timestamp: "2026-11-12T15:00:00.000Z", value: 116.9 },
    ];
    const result = evaluateThresholds([{ externalId: "P-101-PRESSURE", points }], [high, low]);
    expect(result.anyWindow).toBe(true);
    expect(result.latest).toBe(true);
    expect(result.breachedPointCount).toBe(2);
    expect(result.rules.find((item) => item.rule.direction === "high")).toMatchObject({ windowCount: 1, latest: true });
    expect(result.rules.find((item) => item.rule.direction === "low")).toMatchObject({ windowCount: 1, latest: false });
    expect(breachColorForValue(116.9, [high, low])).toBe("#d13b2e");
    expect(breachColorForValue(96, [high, low])).toBe("#d07a18");
    expect(breachColorForValue(110, [high, low])).toBeUndefined();
  });

  it("includes threshold values in the plot domain so lines stay on-chart", () => {
    const domain = valueDomain([106, 110], [high]);
    expect(domain.max).toBeGreaterThanOrEqual(115);
    expect(domain.min).toBeLessThanOrEqual(106);
    const yHigh = scaleY(115, domain.min, domain.max);
    const yMid = scaleY(110, domain.min, domain.max);
    expect(yHigh).toBeLessThan(yMid);
    expect(yHigh).toBeGreaterThanOrEqual(30);
    expect(yHigh).toBeLessThanOrEqual(142);
  });

  it("formats a threshold legend label", () => {
    expect(thresholdLabel(high, "psi")).toBe(`${t("High")} 115 psi`);
    expect(thresholdLabel({ ...low, label: "Low trip" }, "psi")).toBe("Low trip 100 psi");
  });
});
