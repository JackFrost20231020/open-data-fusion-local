import { Minus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { ExplorerSnapshot, IndustrialEvent, TelemetryPoint } from "../types";
import type { CanvasWidget, ChartMode } from "./industrialCanvas";
import { FileChartColumn } from "lucide-react";
import {
  breachColorForValue,
  CHART_PLOT,
  evaluateThresholds,
  rulesForSeries,
  scaleY,
  thresholdLabel,
  valueDomain,
  type CanvasThresholdRule,
} from "./chartThresholds";
import {
  formatDuration,
  parseWindow,
  timeForX,
  telemetryQueryWindow,
  windowFromPlotX,
  xForTime,
  zoomInWindow,
  zoomOutWindow,
  type TimeWindow,
} from "./chartZoom";
import { eventTypeLabel } from "./IndustrialEventDetail";
import { telemetryWindow } from "./canvasTelemetry";
import { formatDateTime, t } from "../i18n";

function EmptyState({ icon: Icon, title, body, action, onAction }: { icon: typeof FileChartColumn; title: string; body: string; action: string; onAction?: () => void }) {
  return (
    <div className="industrial-widget-empty">
      <span><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{body}</p>
      {onAction ? <button type="button" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

function bandPath(coords: Array<{ x: number; yMin: number; yMax: number }>): string {
  if (!coords.length) return "";
  const top = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.yMax.toFixed(1)}`).join(" ");
  const bottom = [...coords].reverse().map((point) => `L${point.x.toFixed(1)} ${point.yMin.toFixed(1)}`).join(" ");
  return `${top} ${bottom} Z`;
}

export function TimeSeriesChart({
  widget,
  telemetry,
  telemetryStatus = "idle",
  events = [],
  onUpdate,
  onConnectData,
  onRetryTelemetry,
  onSelectEvent,
}: {
  widget: CanvasWidget;
  telemetry: ExplorerSnapshot["telemetry"] | null;
  telemetryStatus?: "idle" | "loading" | "error" | "ready";
  events?: IndustrialEvent[];
  onUpdate: (patch: Partial<CanvasWidget["data"]>) => void;
  onConnectData: () => void;
  onRetryTelemetry?: () => void;
  onSelectEvent?: (event: IndustrialEvent) => void;
}) {
  const bound = Boolean(widget.data.connectedSeries?.length);
  const connectedSeries = bound ? telemetry?.series ?? [] : [];
  const hidden = new Set(widget.data.hiddenSeries ?? []);
  const mode = widget.data.chartMode ?? (widget.kind === "timeSeries" ? "multi" : "line");
  const visibleSeries = connectedSeries.filter((series) => !hidden.has(series.externalId)).slice(0, 4);
  const thresholds: CanvasThresholdRule[] = widget.data.thresholds ?? [];
  const zoomWindow = widget.data.zoomWindow ?? null;
  const currentWindow: TimeWindow = telemetry?.range ?? telemetryQueryWindow(widget.data.timeRange, zoomWindow);
  const outerWindow = telemetryWindow(widget.data.timeRange ?? "24h");
  const isAggregated = telemetry?.mode === "aggregate";
  const breach = useMemo(() => evaluateThresholds(connectedSeries, thresholds), [connectedSeries, thresholds]);
  const colors = ["#0b6ffb", "#7c5ce7", "#159477", "#d07a18"];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ startX: number; currentX: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; point: TelemetryPoint; seriesName: string; unit?: string | null } | null>(null);

  const paths = useMemo(() => visibleSeries.map((series) => {
    const seriesRules = rulesForSeries(thresholds, series.externalId);
    const points = series.points;
    if (!points.length) {
      return { id: series.externalId, name: series.name, unit: series.unit, path: "", area: "", band: "", coords: [] as Array<{ x: number; y: number; yMin?: number; yMax?: number; point: TelemetryPoint; breachColor?: string; label: string }>, rules: [] as Array<CanvasThresholdRule & { y: number; label: string }> };
    }
    const values = points.flatMap((point) => [point.value, point.min ?? point.value, point.max ?? point.value]);
    const { min, max } = valueDomain(values, seriesRules);
    const coords = points.map((point) => {
      const x = xForTime(Date.parse(point.timestamp), currentWindow);
      const y = scaleY(point.value, min, max);
      const yMin = scaleY(point.min ?? point.value, min, max);
      const yMax = scaleY(point.max ?? point.value, min, max);
      const unit = series.unit ? ` ${series.unit}` : "";
      return {
        x,
        y,
        yMin,
        yMax,
        point,
        breachColor: breachColorForValue(point.value, seriesRules),
        label: `${formatDateTime(point.timestamp)} · ${point.value}${unit}`,
      };
    });
    const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const hasBand = coords.some((point) => Math.abs((point.yMax ?? point.y) - (point.yMin ?? point.y)) > 0.4);
    return {
      id: series.externalId,
      name: series.name,
      unit: series.unit,
      path,
      area: `${path} L${CHART_PLOT.right} 154 L${CHART_PLOT.left} 154 Z`,
      band: hasBand ? bandPath(coords.map((point) => ({ x: point.x, yMin: point.yMin ?? point.y, yMax: point.yMax ?? point.y }))) : "",
      coords,
      rules: seriesRules.map((rule) => ({
        ...rule,
        y: Math.min(CHART_PLOT.bottom, Math.max(CHART_PLOT.top, scaleY(rule.value, min, max))),
        label: thresholdLabel(rule, series.unit),
      })),
    };
  }), [visibleSeries, thresholds, currentWindow]);

  if (!bound) {
    return <EmptyState icon={FileChartColumn} title={t("No data source selected")} body={t("Connect governed time-series data to draw this chart.")} action={t("Select data source")} onAction={onConnectData} />;
  }
  if (telemetryStatus === "loading" || telemetryStatus === "idle") {
    return <p className="industrial-chart-status">{t("Loading telemetry…")}</p>;
  }
  if (telemetryStatus === "error") {
    return <EmptyState icon={FileChartColumn} title={t("Telemetry could not be loaded")} body={t("The API request for this time series failed. Check the project scope and try again.")} action={t("Retry")} onAction={onRetryTelemetry ?? onConnectData} />;
  }
  if (!connectedSeries.length || connectedSeries.every((series) => !series.points.length)) {
    return <EmptyState icon={FileChartColumn} title={t("No points in this range")} body={t("The connected series has no points for the selected time range.")} action={t("Change data source")} onAction={onConnectData} />;
  }

  function toggleSeries(externalId: string) {
    const next = new Set(widget.data.hiddenSeries ?? []);
    if (next.has(externalId)) next.delete(externalId); else next.add(externalId);
    onUpdate({ hiddenSeries: [...next] });
  }

  function clientToViewX(event: React.PointerEvent<SVGSVGElement>): number {
    const svg = svgRef.current;
    if (!svg) return CHART_PLOT.left;
    const rect = svg.getBoundingClientRect();
    const ratio = 360 / Math.max(rect.width, 1);
    return (event.clientX - rect.left) * ratio;
  }

  function clientToViewY(event: React.PointerEvent<SVGSVGElement>): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    return (event.clientY - rect.top) * (164 / Math.max(rect.height, 1));
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = clientToViewX(event);
    setDrag({ startX: x, currentX: x });
    setHover(null);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const x = clientToViewX(event);
    const y = clientToViewY(event);
    if (drag) {
      setDrag({ ...drag, currentX: x });
      return;
    }
    let nearest: { distance: number; x: number; y: number; point: TelemetryPoint; seriesName: string; unit?: string | null } | null = null;
    for (const series of paths) {
      for (const coord of series.coords) {
        const distance = Math.abs(coord.x - x);
        if (!nearest || distance < nearest.distance) {
          nearest = { distance, x: coord.x, y: coord.y, point: coord.point, seriesName: series.name, unit: series.unit };
        }
      }
    }
    setHover(nearest && nearest.distance < 12 ? { x: nearest.x, y: nearest.y, point: nearest.point, seriesName: nearest.seriesName, unit: nearest.unit } : null);
    void y;
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const next = windowFromPlotX(drag.startX, drag.currentX, currentWindow);
    setDrag(null);
    if (next) onUpdate({ zoomWindow: next });
  }

  function changeTimeRange(timeRange: string) {
    onUpdate({ timeRange, zoomWindow: null });
  }

  const dragMin = drag ? Math.min(drag.startX, drag.currentX) : 0;
  const dragMax = drag ? Math.max(drag.startX, drag.currentX) : 0;
  const dragMs = drag ? Math.abs(timeForX(drag.currentX, currentWindow) - timeForX(drag.startX, currentWindow)) : 0;
  const relevantEvents = events.filter((item) => {
    const assets = new Set(widget.data.connectedSeries?.map((series) => series.assetExternalId) ?? []);
    if (!item.assetExternalIds.some((id) => assets.has(id))) return false;
    const start = Date.parse(item.startTime);
    const end = Date.parse(item.endTime ?? item.startTime);
    const { from, to } = parseWindow(currentWindow);
    return end >= from && start <= to;
  });
  const showPoints = (paths[0]?.coords.length ?? 0) <= 160;

  return (
    <div className={`industrial-chart-widget${breach.anyWindow ? " is-breaching" : ""}`}>
      <div className="industrial-chart-controls">
        <label><span className="sr-only">{t("Chart style")}</span><select value={mode} onChange={(event) => onUpdate({ chartMode: event.target.value as ChartMode })}><option value="line">{t("Line")}</option><option value="area">{t("Area")}</option><option value="multi">{t("Multi-series")}</option></select></label>
        <label><span className="sr-only">{t("Time range")}</span><select value={zoomWindow ? "custom" : (widget.data.timeRange ?? "24h")} onChange={(event) => changeTimeRange(event.target.value)}>
          <option value="1h">{t("1-hour")}</option>
          <option value="24h">{t("24-hour")}</option>
          <option value="7d">{t("7-day")}</option>
          <option value="30d">{t("30-day")}</option>
          {zoomWindow ? <option value="custom">{`自定义 · ${formatDuration(parseWindow(zoomWindow).span)}`}</option> : null}
        </select></label>
        <button type="button" aria-label={t("Zoom out time range")} onClick={() => onUpdate({ zoomWindow: zoomOutWindow(currentWindow, outerWindow) })}><Minus size={13} /></button>
        <button type="button" aria-label={t("Zoom in time range")} onClick={() => onUpdate({ zoomWindow: zoomInWindow(currentWindow) })}><Plus size={13} /></button>
        <button type="button" aria-label={t("Reset time range")} disabled={!zoomWindow} onClick={() => onUpdate({ zoomWindow: null })}><RotateCcw size={13} /></button>
        {isAggregated ? <span className="industrial-chart-mode-tag">聚合</span> : <span className="industrial-chart-mode-tag">原始点</span>}
      </div>
      <div className="industrial-chart-legend">
        {connectedSeries.slice(0, 4).map((series, index) => <button key={series.externalId} type="button" className={hidden.has(series.externalId) ? "is-hidden" : ""} onClick={() => toggleSeries(series.externalId)}><i style={{ background: colors[index] }} />{series.name}</button>)}
      </div>
      {thresholds.length ? <div className="industrial-chart-thresholds" aria-label={t("Threshold rules")}>{thresholds.map((rule) => { const state = breach.rules.find((item) => item.rule.id === rule.id); return <span key={rule.id} className={`industrial-threshold-chip${state?.windowCount ? " is-breaching" : ""}`} style={{ "--threshold-color": rule.color } as React.CSSProperties}>{thresholdLabel(rule, visibleSeries.find((series) => series.externalId === rule.seriesExternalId)?.unit ?? visibleSeries[0]?.unit)}</span>; })}</div> : null}
      <svg
        ref={svgRef}
        className="industrial-chart"
        viewBox="0 0 360 164"
        role="img"
        aria-label={[t("{mode} chart with {count} visible series", { mode: t(mode), count: visibleSeries.length }), isAggregated ? t("aggregated min-max band") : "", breach.anyWindow ? t("threshold breaches visible") : thresholds.length ? t("thresholds in range") : ""].filter(Boolean).join("，")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setHover(null); }}
        style={{ cursor: drag ? "ew-resize" : "crosshair" }}
      >
        <g className="industrial-chart-grid">{[30, 58, 86, 114, 142].map((y) => <line key={y} x1="12" x2="348" y1={y} y2={y} />)}</g>
        {paths.map((series, index) => mode === "area" && index === 0 ? <path key={`${series.id}-area`} d={series.area} fill={`${colors[index]}22`} /> : null)}
        {paths.map((series, index) => series.band ? <path key={`${series.id}-band`} data-testid="chart-agg-band" className="industrial-chart-band" d={series.band} fill={colors[index]} fillOpacity="0.28" stroke={colors[index]} strokeOpacity="0.35" strokeWidth="0.8" /> : null)}
        {paths.flatMap((series) => (series.rules ?? []).map((rule) => {
          const regionY = rule.direction === "high" ? CHART_PLOT.top : rule.y;
          const regionHeight = rule.direction === "high" ? Math.max(0, rule.y - CHART_PLOT.top) : Math.max(0, CHART_PLOT.bottom - rule.y);
          return <rect key={`${series.id}-${rule.id}-region`} data-testid="threshold-region" x={CHART_PLOT.left} width={CHART_PLOT.width} y={regionY} height={regionHeight} fill={rule.color} fillOpacity="0.16" pointerEvents="none" />;
        }))}
        {relevantEvents.map((item) => {
          const start = xForTime(Date.parse(item.startTime), currentWindow);
          const end = xForTime(Date.parse(item.endTime ?? item.startTime), currentWindow);
          const left = Math.min(start, end);
          const width = Math.max(Math.abs(end - start), 2);
          const isAlarm = item.type === "alarm";
          return (
            <g key={item.externalId} className="industrial-chart-event" data-testid="chart-event-marker" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelectEvent?.(item); }}>
              {width > 3 ? <rect x={left} y={CHART_PLOT.top} width={width} height={CHART_PLOT.height} fill={isAlarm ? "#d13b2e" : "#0b6ffb"} fillOpacity="0.12" /> : null}
              <line x1={start} x2={start} y1={CHART_PLOT.top} y2={CHART_PLOT.bottom} stroke={isAlarm ? "#d13b2e" : "#0b6ffb"} strokeWidth="1.2" />
              <polygon points={`${start},${CHART_PLOT.top - 1} ${start + 4},${CHART_PLOT.top + 7} ${start - 4},${CHART_PLOT.top + 7}`} fill={isAlarm ? "#d13b2e" : "#0b6ffb"} />
              <title>{`${eventTypeLabel(item.type)} · ${item.description ?? item.externalId}`}</title>
            </g>
          );
        })}
        {paths.map((series, index) => <path key={`${series.id}-line`} d={series.path} fill="none" stroke={colors[index]} strokeWidth="2" />)}
        {paths.flatMap((series) => (series.rules ?? []).map((rule) => (
          <g key={`${series.id}-${rule.id}-line`} className="industrial-threshold-layer" pointerEvents="none">
            <line data-testid="threshold-line" x1={CHART_PLOT.left} x2={CHART_PLOT.right} y1={rule.y} y2={rule.y} stroke={rule.color} strokeWidth="1.5" strokeDasharray="4 3" />
            <text x={CHART_PLOT.left + 4} y={Math.max(CHART_PLOT.top + 8, rule.y - 4)} textAnchor="start" fill={rule.color} fontSize="7" fontWeight="700">{rule.label}</text>
          </g>
        )))}
        {showPoints ? paths.map((series, index) => <g key={series.id}>{series.coords.map((point, pointIndex) => <circle key={pointIndex} className={point.breachColor ? "is-breaching" : undefined} data-testid={point.breachColor ? "threshold-breach-point" : "chart-point"} cx={point.x} cy={point.y} r={point.breachColor ? 3.6 : 2.2} fill={point.breachColor ?? colors[index]}><title>{point.label}</title></circle>)}</g>) : null}
        {drag && dragMax - dragMin > 2 ? (
          <g data-testid="chart-drag-overlay" pointerEvents="none">
            <rect x={dragMin} y={CHART_PLOT.top} width={dragMax - dragMin} height={CHART_PLOT.height} fill="#5b6570" fillOpacity="0.22" />
            <text x={(dragMin + dragMax) / 2} y={CHART_PLOT.top + 12} textAnchor="middle" fill="#2a3945" fontSize="8" fontWeight="700">{formatDuration(dragMs)}</text>
          </g>
        ) : null}
        {hover && !drag ? (
          <g data-testid="chart-tooltip" pointerEvents="none">
            <line x1={hover.x} x2={hover.x} y1={CHART_PLOT.top} y2={CHART_PLOT.bottom} stroke="#8a96a0" strokeDasharray="2 2" />
            <circle cx={hover.x} cy={hover.y} r="4" fill="#fff" stroke="#2a3945" strokeWidth="1.2" />
          </g>
        ) : null}
      </svg>
      {hover && !drag ? (
        <div className="industrial-chart-tooltip" data-testid="chart-tooltip-label">
          <strong>{hover.seriesName}</strong>
          <span>时间 {formatDateTime(hover.point.timestamp)}</span>
          {hover.point.avg != null || isAggregated ? <span>均值 {hover.point.avg ?? hover.point.value}{hover.unit ? ` ${hover.unit}` : ""}</span> : <span>值 {hover.point.value}{hover.unit ? ` ${hover.unit}` : ""}</span>}
          {hover.point.max != null ? <span>最大 {hover.point.max}{hover.unit ? ` ${hover.unit}` : ""}</span> : null}
          {hover.point.min != null ? <span>最小 {hover.point.min}{hover.unit ? ` ${hover.unit}` : ""}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
