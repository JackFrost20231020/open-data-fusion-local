import { formatNumber, t } from "../i18n";

const STALE_MS = 24 * 60 * 60 * 1000;

export interface SparklinePoint {
  timestamp: string;
  value: number;
}

export interface SparklineStats {
  latest: number | null;
  latestAt: number | null;
  changePercent: number | null;
  stale: boolean;
  points: Array<{ time: number; value: number }>;
}

export function sparklineStats(points: readonly SparklinePoint[] | undefined, now = Date.now()): SparklineStats {
  const parsed = (points ?? [])
    .map((point) => ({ time: new Date(point.timestamp).getTime(), value: point.value }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((left, right) => left.time - right.time);
  const latest = parsed.at(-1) ?? null;
  const stale = !latest || now - latest.time > STALE_MS;
  const baseline = parsed.find((point) => latest != null && latest.time - point.time >= STALE_MS * 0.9) ?? parsed[0];
  const changePercent =
    latest && baseline && Math.abs(baseline.value) > 1e-9 && latest.time !== baseline.time
      ? ((latest.value - baseline.value) / Math.abs(baseline.value)) * 100
      : latest && baseline && latest.time !== baseline.time && baseline.value === 0
        ? (latest.value === 0 ? 0 : null)
        : null;
  return {
    latest: latest?.value ?? null,
    latestAt: latest?.time ?? null,
    changePercent,
    stale,
    points: parsed,
  };
}

function sparkPath(points: SparklineStats["points"]): string {
  if (points.length === 0) return "";
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return points
    .map((point, index) => {
      const x = points.length === 1 ? 36 : (index / (points.length - 1)) * 72;
      const y = 22 - ((point.value - min) / span) * 18;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function SparklineTile({
  name,
  unit,
  points,
  source,
  onClick,
}: {
  name: string;
  unit?: string | null;
  points?: readonly SparklinePoint[];
  source?: string | null;
  onClick?: () => void;
}) {
  const stats = sparklineStats(points);
  const path = sparkPath(stats.points.slice(-48));
  const change = stats.changePercent;
  const changeLabel =
    change == null ? t("No change")
    : change > 0 ? t("Up {percent}%", { percent: formatNumber(Math.abs(change), { maximumFractionDigits: 1 }) })
    : change < 0 ? t("Down {percent}%", { percent: formatNumber(Math.abs(change), { maximumFractionDigits: 1 }) })
    : t("No change");
  const tone = stats.stale ? "is-stale" : change != null && change > 0 ? "is-up" : change != null && change < 0 ? "is-down" : "is-flat";
  const latestLabel = stats.latest == null
    ? t("No recent value")
    : `${formatNumber(stats.latest, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;

  return (
    <button type="button" className={`sparkline-tile ${tone}`} onClick={onClick}>
      <span className="sparkline-tile__copy">
        <strong>{name}</strong>
        <span className="sparkline-tile__metrics">
          <b>{latestLabel}</b>
          {stats.stale ? <small className="sparkline-tile__stale">{t("24 hours without data")}</small> : <small>{changeLabel}</small>}
        </span>
        {source ? <small className="sparkline-tile__source">{source}</small> : null}
      </span>
      {path ? (
        <svg className="sparkline-tile__chart" viewBox="0 0 72 24" aria-hidden="true" focusable="false">
          <path d={path} />
        </svg>
      ) : <span className="sparkline-tile__chart is-empty" aria-hidden="true" />}
    </button>
  );
}
