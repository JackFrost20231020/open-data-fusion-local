import { ChevronDown } from "lucide-react";
import { useId } from "react";
import type { TelemetryPoint } from "../types";
import { LOCALE, formatDateTime, formatNumber, t } from "../i18n";
import { sparklineStats } from "./SparklineTile";

const HOUR_MS = 60 * 60 * 1_000;
const RANGE_DURATION_MS = {
  "24h": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
  "30d": 30 * 24 * HOUR_MS,
} as const;
function rangeDescription(range: PressureChartRange): string {
  return t({ "24h": "24-hour", "7d": "7-day", "30d": "30-day" }[range]);
}

const PLOT_LEFT = 64;
const PLOT_RIGHT = 790;
const PLOT_TOP = 16;
const PLOT_BOTTOM = 296;
const X_TICK_COUNT = 5;
const Y_TICK_COUNT = 5;

const tickDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const tickTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: "UTC",
});

export type PressureChartRange = keyof typeof RANGE_DURATION_MS;

type PressureChartPoint = Pick<TelemetryPoint, "timestamp" | "value">;

export interface PressureChartProps {
  range: PressureChartRange;
  onRangeChange: (range: PressureChartRange) => void;
  points?: readonly PressureChartPoint[];
  rangeEnd?: string;
  title?: string;
  unit?: string;
}

interface NormalizedPoint extends PressureChartPoint {
  time: number;
}

function parseTimestamp(timestamp?: string) {
  if (!timestamp) return null;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? time : null;
}

function normalizePoints(points: readonly PressureChartPoint[]) {
  return points
    .reduce<NormalizedPoint[]>((validPoints, point) => {
      const time = parseTimestamp(point.timestamp);
      if (time !== null && Number.isFinite(point.value)) validPoints.push({ ...point, time });
      return validPoints;
    }, [])
    .sort((left, right) => left.time - right.time);
}

function yDomain(points: readonly NormalizedPoint[]) {
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum;
  const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum));
  const padding = spread === 0
    ? (magnitude === 0 ? 1 : magnitude * 0.05)
    : Math.max(spread * 0.1, magnitude * 0.005);

  return { minimum: minimum - padding, maximum: maximum + padding };
}

function chartData(points: readonly PressureChartPoint[], range: PressureChartRange, rangeEnd?: string) {
  const normalizedPoints = normalizePoints(points);
  const latestPoint = normalizedPoints.at(-1);
  if (!latestPoint) return null;

  const duration = RANGE_DURATION_MS[range];
  const requestedEnd = parseTimestamp(rangeEnd) ?? latestPoint.time;
  const requestedStart = requestedEnd - duration;
  const requestedPoints = normalizedPoints.filter((point) => point.time >= requestedStart && point.time <= requestedEnd);
  const usesLatestAvailable = requestedPoints.length === 0;
  const domainEnd = usesLatestAvailable ? latestPoint.time : requestedEnd;
  const domainStart = domainEnd - duration;
  const visiblePoints = usesLatestAvailable
    ? normalizedPoints.filter((point) => point.time >= domainStart && point.time <= domainEnd)
    : requestedPoints;

  return {
    domainEnd,
    domainStart,
    points: visiblePoints,
    requestedEnd,
    usesLatestAvailable,
    yDomain: yDomain(visiblePoints),
  };
}

function xPosition(time: number, domainStart: number, domainEnd: number) {
  return PLOT_LEFT + ((time - domainStart) / (domainEnd - domainStart)) * (PLOT_RIGHT - PLOT_LEFT);
}

function yPosition(value: number, minimum: number, maximum: number) {
  return PLOT_TOP + ((maximum - value) / (maximum - minimum)) * (PLOT_BOTTOM - PLOT_TOP);
}

function linePath(points: readonly NormalizedPoint[], domainStart: number, domainEnd: number, minimum: number, maximum: number) {
  return points.map((point, index) => {
    const x = xPosition(point.time, domainStart, domainEnd);
    const y = yPosition(point.value, minimum, maximum);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function fractionDigits(step: number) {
  if (!Number.isFinite(step) || step === 0) return 2;
  return Math.min(6, Math.max(0, 1 - Math.floor(Math.log10(Math.abs(step)))));
}

function formatValue(value: number, maximumFractionDigits: number) {
  return formatNumber(Object.is(value, -0) ? 0 : value, { maximumFractionDigits });
}

function formatChartTime(time: number) {
  return `${formatDateTime(time, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

function isPressureChartRange(value: string): value is PressureChartRange {
  return value in RANGE_DURATION_MS;
}

export function PressureChart({ range, onRangeChange, points = [], rangeEnd, title = t("Pressure"), unit = "psi" }: PressureChartProps) {
  const headingId = useId();
  const svgTitleId = useId();
  const svgDescriptionId = useId();
  const data = chartData(points, range, rangeEnd);
  const displayRange = data?.usesLatestAvailable ? t("latest available {range}", { range: rangeDescription(range) }) : rangeDescription(range);


  const stats = sparklineStats(points);
  const change = stats.changePercent;
  const changeTone = stats.stale ? "is-stale" : change != null && change > 0 ? "is-up" : change != null && change < 0 ? "is-down" : "";
  const changeLabel = stats.stale ? t("24 hours without data")
    : change == null ? t("No change")
    : change > 0 ? t("Up {percent}%", { percent: formatNumber(Math.abs(change), { maximumFractionDigits: 1 }) })
    : change < 0 ? t("Down {percent}%", { percent: formatNumber(Math.abs(change), { maximumFractionDigits: 1 }) })
    : t("No change");
  let chart = null;
  if (data) {
    const { domainEnd, domainStart, requestedEnd, usesLatestAvailable, yDomain: domain } = data;
    const finalPoint = data.points.at(-1)!;
    const yStep = (domain.maximum - domain.minimum) / (Y_TICK_COUNT - 1);
    const digits = fractionDigits(yStep);
    const yTicks = Array.from({ length: Y_TICK_COUNT }, (_, index) => domain.maximum - index * yStep);
    const timeTicks = Array.from({ length: X_TICK_COUNT }, (_, index) => domainStart + (index / (X_TICK_COUNT - 1)) * (domainEnd - domainStart));
    const path = linePath(data.points, domainStart, domainEnd, domain.minimum, domain.maximum);
    const finalX = xPosition(finalPoint.time, domainStart, domainEnd);
    const finalY = yPosition(finalPoint.value, domain.minimum, domain.maximum);
    const pointLabel = data.points.length === 1 ? t("telemetry point") : t("telemetry points");
    const observedStart = data.points[0].time;
    const rangeLabel = rangeDescription(range);
    const valueSummary = t("Values range from {min} to {max} {unit}; the latest value is {latest} {unit} at {time}.", { min: formatValue(Math.min(...data.points.map((point) => point.value)), digits), max: formatValue(Math.max(...data.points.map((point) => point.value)), digits), unit, latest: formatValue(finalPoint.value, digits), time: formatChartTime(finalPoint.time) });
    const description = usesLatestAvailable
      ? t("No telemetry points fall within the requested {range} window ending {end}. Showing {count} {points} from the latest available {range} window, observed between {start} and {observed}. {summary}", { range: rangeLabel, end: formatChartTime(requestedEnd), count: data.points.length, points: pointLabel, start: formatChartTime(observedStart), observed: formatChartTime(finalPoint.time), summary: valueSummary })
      : t("Showing {count} {points} in the {range} window from {from} to {to}, observed between {start} and {observed}. {summary}", { count: data.points.length, points: pointLabel, range: rangeLabel, from: formatChartTime(domainStart), to: formatChartTime(domainEnd), start: formatChartTime(observedStart), observed: formatChartTime(finalPoint.time), summary: valueSummary });

    chart = (
      <svg viewBox="0 0 812 332" role="img" aria-labelledby={svgTitleId} aria-describedby={svgDescriptionId} focusable="false">
        <title id={svgTitleId}>{t("{title} over {range}", { title, range: displayRange })}</title>
        <desc id={svgDescriptionId}>{description}</desc>
        <g aria-hidden="true">
          {yTicks.map((tick, index) => {
            const y = PLOT_TOP + (index / (Y_TICK_COUNT - 1)) * (PLOT_BOTTOM - PLOT_TOP);
            return (
              <g key={index}>
                <line className="grid-line" x1={PLOT_LEFT} y1={y} x2={PLOT_RIGHT} y2={y} />
                <text className="axis-label y-label" x={PLOT_LEFT - 10} y={y + 4} textAnchor="end">{formatValue(tick, digits)}</text>
              </g>
            );
          })}
          {timeTicks.map((tick, index) => {
            const x = xPosition(tick, domainStart, domainEnd);
            const textAnchor = index === 0 ? "start" : index === timeTicks.length - 1 ? "end" : "middle";
            const timestamp = new Date(tick).toISOString();
            return (
              <g key={timestamp} data-timestamp={timestamp}>
                <text className="axis-label" x={x} y="316" textAnchor={textAnchor}>{tickDateFormatter.format(tick)}</text>
                <text className="date-label" x={x} y="330" textAnchor={textAnchor}>{tickTimeFormatter.format(tick)} UTC</text>
              </g>
            );
          })}
          <path
            className="pressure-line"
            d={path}
            data-point-count={data.points.length}
            data-window-end={new Date(domainEnd).toISOString()}
            data-window-start={new Date(domainStart).toISOString()}
          />
          <circle className="final-ring" cx={finalX} cy={finalY} r="7" />
          <circle className="final-dot" cx={finalX} cy={finalY} r="3.7" />
        </g>
      </svg>
    );
  }

  return (
    <section className="chart-section" aria-labelledby={headingId}>
      <div className="chart-header">
        <div>
          <h2 id={headingId}>{title} ({displayRange})</h2>
          <div className="series-key"><span /> {unit}</div>
        </div>
        <div className="chart-actions">
          <label className="range-select">
            <span className="sr-only">{t("Time range")}</span>
            <select value={range} onChange={(event) => {
              if (isPressureChartRange(event.target.value)) onRangeChange(event.target.value);
            }}>
              <option value="24h">{t("24-hour")}</option>
              <option value="7d">{t("7-day")}</option>
              <option value="30d">{t("30-day")}</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>

        </div>
      </div>
        {stats.latest != null || stats.stale ? (
          <dl className="chart-kpi">
            <div>
              <dt>{t("Latest")}</dt>
              <dd>{stats.latest == null ? t("No recent value") : `${formatNumber(stats.latest, { maximumFractionDigits: 2 })} ${unit}`}</dd>
            </div>
            <div>
              <dt>{t("24-hour change")}</dt>
              <dd className={changeTone}>{changeLabel}</dd>
            </div>
          </dl>
        ) : null}
      <div className="chart-wrap">
        {chart ?? <div className="chart-empty-state" role="status">{t("No valid telemetry points are available.")}</div>}
      </div>
    </section>
  );
}
