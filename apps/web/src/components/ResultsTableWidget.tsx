import { useEffect, useState } from "react";
import { getCaseAnalysis, getCaseImportReport, type CaseDocumentSummary } from "../lib/api";
import type { PlatformContext } from "../types";
import { t } from "../i18n";
import type { CanvasWidget } from "./industrialCanvas";

interface ResultsTableWidgetProps {
  widget: CanvasWidget;
  platformContext: PlatformContext | null;
}

interface Impact {
  source?: string;
  text?: string;
}

interface Listed {
  tag?: string;
  name?: string;
  shortCode?: string;
  page?: string;
  hops?: number;
  sources?: string[];
  notes?: string[];
}

export function ResultsTableWidget({ widget, platformContext }: ResultsTableWidgetProps) {
  const caseKey = widget.data.caseKey ?? "";
  const instrumentTag = widget.data.instrumentTag ?? widget.data.queryInstrument ?? "";
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!platformContext) return;
    const controller = new AbortController();
    void Promise.all([
      instrumentTag ? getCaseAnalysis(platformContext, caseKey, instrumentTag, controller.signal) : Promise.resolve(null),
      getCaseImportReport(platformContext, caseKey, controller.signal),
    ]).then(([nextAnalysis, nextReport]) => {
      setAnalysis(nextAnalysis);
      setReport(nextReport);
    }).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : t("Failed to load analysis"));
    });
    return () => controller.abort();
  }, [platformContext, caseKey, instrumentTag]);

  if (error) return <p className="industrial-results-error">{error}</p>;
  if (!analysis) return <p className="industrial-results-empty">{platformContext ? t("Loading analysis…") : t("Waiting for project context")}</p>;

  const aliases = analysis.aliasesPreserved as { taskTag?: string; packageTag?: string; note?: string } | undefined;
  const single = analysis.singleChannel as { summary?: string; impacts?: Impact[]; needsEngineeringConfirmation?: boolean };
  const sharedPipe = analysis.sharedPipe as {
    method?: string;
    derivedFromGraph?: Listed[];
    listedInXlsx?: Listed[];
    agreement?: string[];
    disagreement?: string[];
    needsEngineeringConfirmation?: boolean;
  };
  const sharedCard = analysis.sharedCard as {
    method?: string;
    fromPointTable?: Listed[];
    fromRiskDoc?: Listed[];
    excludedByDoc?: string[];
    cardHint?: string;
    needsEngineeringConfirmation?: boolean;
  };
  const documents = ((analysis.evidenceDocuments as CaseDocumentSummary[] | undefined) ?? []);
  const nodes = (report?.nodes as { total?: number; graphInfo?: number; graphInstance?: number } | undefined) ?? {};
  const rels = (report?.relationships as { total?: number; belong?: number; connects?: number; connectsCrossPage?: number } | undefined) ?? {};

  return (
    <div className="industrial-results-widget">
      <section>
        <h3>{t("Naming note")}</h3>
        <p>{aliases?.note}</p>
        <p className="is-warning">{t("Conclusions below are derived from imported data and documents; they have not been physically validated and need engineering confirmation.")}</p>
      </section>
      {report ? (
        <section>
          <h3>{t("Import report")}</h3>
          <p>
            {t("Imported {nodes} nodes ({pages} pages, {instances} instances) and {rels} relationships in {ms} ms. Peak heap {heap} MB.", {
              nodes: String(nodes.total ?? "—"),
              pages: String(nodes.graphInfo ?? "—"),
              instances: String(nodes.graphInstance ?? "—"),
              rels: String(rels.total ?? "—"),
              ms: String(report.durationMs ?? "—"),
              heap: report.peakHeapBytes ? (Number(report.peakHeapBytes) / 1024 / 1024).toFixed(1) : "—",
            })}
            {rels.connectsCrossPage != null ? ` ${t("Cross-page CONNECTS")}: ${rels.connectsCrossPage}.` : ""}
          </p>
          <ul className="industrial-doc-status">
            {documents.map((doc) => (
              <li key={doc.fileName}>
                <strong>{doc.fileName}</strong>
                <span className={doc.parseStatus === "attached_only" ? "is-attached" : "is-parsed"}>
                  {doc.parseStatus === "attached_only" ? t("attached only") : t("parsed")}
                  {doc.parseTool ? ` · ${doc.parseTool}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h3>{t("Single-channel failure")}</h3>
        <p>{single?.summary}</p>
        <ul>{(single?.impacts ?? []).map((item, index) => (
          <li key={index}><em>{sourceLabel(item.source)}</em>{item.text}</li>
        ))}</ul>
        <Badge confirm={single?.needsEngineeringConfirmation} />
      </section>
      <section>
        <h3>{t("Shared-pipe instruments")}</h3>
        <p>{sharedPipe?.method}</p>
        <table>
          <thead>
            <tr>
              <th>{t("Tag")}</th>
              <th>{t("Page")}</th>
              <th>{t("Hops")}</th>
              <th>{t("Source")}</th>
            </tr>
          </thead>
          <tbody>
            {(sharedPipe?.derivedFromGraph ?? []).map((row) => (
              <tr key={`${row.tag}-${row.page}`}>
                <td>{row.shortCode || row.tag}</td>
                <td>{row.page ?? "—"}</td>
                <td>{row.hops ?? "—"}</td>
                <td>{(row.sources ?? []).map(sourceLabel).join("、")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{t("Agreement with xlsx")}: {(sharedPipe?.agreement ?? []).join("、") || t("None")}</p>
        <p>{t("Disagreement")}: {(sharedPipe?.disagreement ?? []).join("；") || t("None")}</p>
        <Badge confirm={sharedPipe?.needsEngineeringConfirmation} />
      </section>
      <section>
        <h3>{t("Shared-card instruments")}{sharedCard?.cardHint ? `（${sharedCard.cardHint}）` : ""}</h3>
        <p>{sharedCard?.method}</p>
        <table>
          <thead>
            <tr>
              <th>{t("Tag")}</th>
              <th>{t("Source")}</th>
              <th>{t("Notes")}</th>
            </tr>
          </thead>
          <tbody>
            {(sharedCard?.fromRiskDoc ?? []).concat(sharedCard?.fromPointTable ?? []).map((row) => (
              <tr key={`${row.tag}-${(row.sources ?? []).join()}`}>
                <td>{row.tag}</td>
                <td>{(row.sources ?? []).map(sourceLabel).join("、")}</td>
                <td>{(row.notes ?? []).join("；")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sharedCard?.excludedByDoc?.length ? (
          <p>{t("Excluded per PMS manual")}: {sharedCard.excludedByDoc.join("、")}</p>
        ) : null}
        <Badge confirm={sharedCard?.needsEngineeringConfirmation} />
      </section>
    </div>
  );
}

function sourceLabel(source?: string): string {
  if (source === "graph") return t("graph");
  if (source === "xlsx") return t("xlsx");
  if (source === "risk_doc") return t("risk document");
  if (source === "point_table") return t("point table");
  if (source === "task_text") return t("task text");
  return source ?? "";
}

function Badge({ confirm }: { confirm?: boolean }) {
  return confirm
    ? <p className="is-warning">{t("Needs engineering confirmation")}</p>
    : <p className="is-derived">{t("Derived from imported data")}</p>;
}
