import { Activity, ArrowRight, FileText, GitBranch, ShieldCheck, X } from "lucide-react";
import type { ExplorerSnapshot } from "../types";
import { statusLabel, t } from "../i18n";
import { SparklineTile } from "./SparklineTile";

interface RelatedRailProps {
  snapshot: ExplorerSnapshot | null;
  onAction: (message: string) => void;
  onClose?: () => void;
  open?: boolean;
}

function EmptyRailRow({ children }: { children: React.ReactNode }) {
  return <p className="rail-empty-row">{children}</p>;
}

export function RelatedRail({ snapshot, onAction, onClose, open = false }: RelatedRailProps) {
  const timeSeries = snapshot?.detail.timeSeries ?? [];
  const documents = snapshot?.detail.documents ?? [];
  const relations = snapshot?.detail.relations ?? [];
  const provenance = snapshot?.detail.provenance ?? [];
  const telemetryById = new Map((snapshot?.telemetry.series ?? []).map((series) => [series.externalId, series]));

  return (
    <aside className={`related-rail${open ? " is-open" : ""}`} aria-label={t("Related data")}>
      <div className="related-rail-header"><strong>{t("Related data")}</strong>{onClose ? <button type="button" aria-label={t("Close related data")} onClick={onClose}><X size={18} /></button> : null}</div>
      <section className="rail-section">
        <h2><Activity size={19} /> {t("Related time series ({count})", { count: timeSeries.length })}</h2>
        {timeSeries.length === 0 ? <EmptyRailRow>{t("No time series linked.")}</EmptyRailRow> : timeSeries.map((series) => {
          const points = telemetryById.get(series.externalId)?.points;
          const latestPoint = points?.at(-1);
          const value = latestPoint ? `${latestPoint.value} ${series.unit || ""}`.trim() : t("No recent value");
          return <SparklineTile key={series.externalId} name={series.name} unit={series.unit} points={points} source={series.sourceSystem} onClick={() => onAction(`${series.name}: ${value}`)} />;
        })}
      </section>

      <section className="rail-section">
        <h2><FileText size={19} /> {t("Related documents ({count})", { count: documents.length })}</h2>
        {documents.length === 0 ? <EmptyRailRow>{t("No documents linked.")}</EmptyRailRow> : documents.map((document) => <button className="document-row" type="button" key={document.externalId} onClick={() => onAction(document.uri ? `Document URI: ${document.uri}` : `${document.title} has no URI`)}><span className="pdf-icon"><FileText size={21} /></span><span><strong>{document.title}</strong><small>{document.mimeType || "Unknown type"} · {document.sourceSystem}</small></span></button>)}
      </section>

      <section className="rail-section">
        <h2><GitBranch size={19} /> {t("Contextual relations ({count})", { count: relations.length })}</h2>
        {relations.length === 0 ? <EmptyRailRow>{t("No contextual relations linked.")}</EmptyRailRow> : relations.map((relation) => <button className="relation-row" type="button" key={relation.id} onClick={() => onAction(`${relation.source.externalId} ${relation.type} ${relation.target.externalId}`)}><Activity size={19} strokeWidth={1.4} /><span className="relation-copy"><span><strong>{relation.source.externalId}</strong><ArrowRight size={14} /><strong>{relation.target.externalId}</strong></span><small>{relation.type} · {statusLabel(relation.status)}</small></span></button>)}
      </section>

      <section className="rail-section provenance">
        <h2><ShieldCheck size={19} /> {t("Provenance & evidence")}</h2>
        <p>{t("{count} governed records", { count: provenance.length })}</p>
        {provenance.length === 0 ? <EmptyRailRow>{t("No provenance recorded.")}</EmptyRailRow> : <ul>{provenance.slice(0, 6).map((record) => <li key={record.id}>{record.sourceSystem} <span>({record.ingestionRunId})</span></li>)}</ul>}
      </section>
    </aside>
  );
}
