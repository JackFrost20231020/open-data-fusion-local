import { Circle } from "lucide-react";
import type { ExplorerSnapshot } from "../types";
import { formatDateTime, t } from "../i18n";

export function OverviewDetails({ snapshot }: { snapshot?: ExplorerSnapshot | null }) {
  const asset = snapshot?.detail.asset;
  if (!snapshot || !asset) return null;
  const acceptedRelation = snapshot.detail.relations.find((relation) => relation.status === "accepted");
  const site = typeof asset.metadata.site === "string" ? asset.metadata.site : snapshot.detail.parent?.name || "—";
  const properties = [
    [t("Site / parent"), site],
    [t("Type"), asset.type],
    [t("Source system"), asset.sourceSystem],
    [t("External ID"), asset.externalId],
    [t("Last updated"), formatDateTime(asset.updatedAt)],
  ];
  return (
    <section className="detail-grid" aria-label={t("Asset details")}>
      <div className="detail-card">
        <h2>{t("Properties")}</h2>
        <dl>
          {properties.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="detail-card contextualization-card">
        <h2>{t("Contextualization")}</h2>
        <dl>
          <div><dt>{t("Status")}</dt><dd><span className="reviewed-dot" />{acceptedRelation ? t("Reviewed") : t("No accepted relation")}</dd></div>
          <div><dt>{t("Reviewed by")}</dt><dd>{acceptedRelation?.reviewer || "—"}</dd></div>
          <div><dt>{t("Reviewed on")}</dt><dd>{acceptedRelation?.reviewedAt ? formatDateTime(acceptedRelation.reviewedAt) : "—"}</dd></div>
          <div><dt>{t("Provenance")}</dt><dd><span className="text-link">{t(snapshot.detail.provenance.length === 1 ? "{count} record" : "{count} records", { count: snapshot.detail.provenance.length })}</span></dd></div>
          <div><dt>{t("Confidence")}</dt><dd><Circle size={9} fill="#d68100" color="#d68100" /> {acceptedRelation?.confidence === null || acceptedRelation?.confidence === undefined ? t("Not scored") : `${Math.round(acceptedRelation.confidence * 100)}%`}</dd></div>
        </dl>
      </div>
    </section>
  );
}
