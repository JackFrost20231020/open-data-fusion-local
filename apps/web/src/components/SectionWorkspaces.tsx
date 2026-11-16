import {
  Activity,
  ArrowRight,
  Box,
  Database,
  FileClock,
  RefreshCw,
  Search,
  ShieldCheck,
  Tags,
  Workflow,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { listAudit, listRelations } from "../lib/api";
import type { ApiAuditEvent, ApiRelation, PlatformContext } from "../types";
import { formatDateTime, t } from "../i18n";

const CONTEXT_PAGE_SIZE = 200;
const AUDIT_PAGE_SIZE = 50;

type RelationStatus = ApiRelation["status"];
type RelationFilter = "all" | RelationStatus;

interface RequestState {
  loading: boolean;
  error: string;
}

export function formatDate(value: string): string {
  return formatDateTime(value);
}

function relationSearchText(relation: ApiRelation): string {
  return [
    relation.source.externalId,
    relation.target.externalId,
    relation.type,
    relation.status,
    relation.sourceSystem,
    relation.reviewer ?? "",
  ].join(" ").toLowerCase();
}

function auditSearchText(event: ApiAuditEvent): string {
  return [
    event.action,
    event.actor,
    event.entityType,
    event.entityId ?? "",
    event.correlationId,
  ].join(" ").toLowerCase();
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <header className="section-heading">
      <span className="section-heading-icon" aria-hidden="true">{icon}</span>
      <div>
        <span className="section-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}

export function LoadState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="section-load-state" role={onRetry ? "alert" : "status"}>
      <span>{message}</span>
      {onRetry ? <button type="button" onClick={onRetry}><RefreshCw size={15} /> Retry</button> : null}
    </div>
  );
}

function RelationRow({ relation, onOpenAsset }: { relation: ApiRelation; onOpenAsset: (externalId: string) => void }) {
  const confidence = relation.confidence === null ? t("Not scored") : `${Math.round(relation.confidence * 100)}%`;
  const evidence = JSON.stringify(relation.evidence, null, 2);
  return (
    <li className="governance-list-row relation-list-row">
      <div className="relation-route">
        <button type="button" onClick={() => onOpenAsset(relation.source.externalId)}>{relation.source.externalId}</button>
        <span><ArrowRight size={14} /> {relation.type}</span>
        <button type="button" onClick={() => onOpenAsset(relation.target.externalId)}>{relation.target.externalId}</button>
      </div>
      <div className="governance-row-meta">
        <span className={`status-chip status-${relation.status}`}>{relation.status}</span>
        <span>{confidence === t("Not scored") ? confidence : t("{percent}% confidence", { percent: relation.confidence === null ? 0 : Math.round(relation.confidence * 100) })}</span>
        <span>{relation.sourceSystem}</span>
        <span>{relation.reviewer ? t("Reviewed by {name}", { name: relation.reviewer }) : t("Not reviewed")}</span>
      </div>
      <small>Updated {formatDate(relation.updatedAt)}{relation.ruleVersion ? ` · Rule ${relation.ruleVersion}` : ""}</small>
      {evidence && evidence !== "[]" && evidence !== "{}" ? <details><summary>{t("Evidence")}</summary><pre>{evidence}</pre></details> : null}
    </li>
  );
}

export function ContextWorkspace({ context, onOpenAsset }: { context: PlatformContext | null; onOpenAsset: (externalId: string) => void }) {
  const [filter, setFilter] = useState<RelationFilter>("all");
  const [query, setQuery] = useState("");
  const [relations, setRelations] = useState<ApiRelation[]>([]);
  const [total, setTotal] = useState(0);
  const [requestState, setRequestState] = useState<RequestState>({ loading: true, error: "" });
  const [reloadToken, setReloadToken] = useState(0);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    if (!context) {
      setRelations([]);
      setTotal(0);
      setRequestState({ loading: false, error: t("Select a project to load relationships.") });
      return undefined;
    }
    const controller = new AbortController();
    setRequestState({ loading: true, error: "" });
    listRelations(context, { status: filter === "all" ? undefined : filter, limit: CONTEXT_PAGE_SIZE }, controller.signal)
      .then((response) => {
        setRelations(response.items);
        setTotal(response.total);
        setRequestState({ loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRelations([]);
        setTotal(0);
        setRequestState({ loading: false, error: error instanceof Error ? error.message : t("Relations could not be loaded") });
      });
    return () => controller.abort();
  }, [context?.tenantId, context?.projectId, filter, reloadToken]);

  const filteredRelations = useMemo(() => {
    if (!deferredQuery) return relations;
    return relations.filter((relation) => relationSearchText(relation).includes(deferredQuery));
  }, [deferredQuery, relations]);

  return (
    <main className="section-workspace">
      <SectionHeading
        eyebrow={t("Governed contextualization")}
        title={t("Context")}
        description={t("Inspect proposed and reviewed relationships with confidence, rule, reviewer, and source evidence.")}
        icon={<Tags size={24} />}
      />
      <div className="section-toolbar">
        <label className="section-search"><Search size={16} /><span className="sr-only">{t("Filter relations")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Filter loaded relations")} /></label>
        <label className="section-filter"><span>{t("Status")}</span><select value={filter} onChange={(event) => setFilter(event.target.value as RelationFilter)}><option value="all">{t("All")}</option><option value="proposed">{t("Proposed")}</option><option value="accepted">{t("Accepted")}</option><option value="rejected">{t("Rejected")}</option><option value="superseded">{t("Superseded")}</option></select></label>
        <span className="section-result-count">{filteredRelations.length} shown · {total} returned</span>
      </div>
      {requestState.loading ? <LoadState message={t("Loading contextual relationships…")} /> : null}
      {requestState.error ? <LoadState message={requestState.error} onRetry={() => setReloadToken((value) => value + 1)} /> : null}
      {!requestState.loading && !requestState.error && filteredRelations.length === 0 ? <LoadState message={query ? t("No loaded relationships match this filter.") : t("No relationships are available for this status.")} /> : null}
      {!requestState.loading && !requestState.error && filteredRelations.length > 0 ? <ol className="governance-list" aria-label={t("Contextual relationships")}>{filteredRelations.map((relation) => <RelationRow key={relation.id} relation={relation} onOpenAsset={onOpenAsset} />)}</ol> : null}
    </main>
  );
}

function AuditRow({ event }: { event: ApiAuditEvent }) {
  const details = Object.keys(event.details).length > 0 ? JSON.stringify(event.details, null, 2) : t("No structured details");
  return (
    <li className="governance-list-row audit-list-row">
      <div className="audit-row-heading"><strong>{event.action}</strong><time dateTime={event.timestamp}>{formatDate(event.timestamp)}</time></div>
      <div className="governance-row-meta"><span>{event.actor}</span><span>{event.entityType}{event.entityId ? ` · ${event.entityId}` : ""}</span><code>{event.correlationId}</code></div>
      <details><summary>{t("Event details")}</summary><pre>{details}</pre></details>
    </li>
  );
}

export function AuditWorkspace({ context }: { context: PlatformContext | null }) {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<ApiAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [requestState, setRequestState] = useState<RequestState>({ loading: true, error: "" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    if (!context) {
      setEvents([]);
      setTotal(0);
      setRequestState({ loading: false, error: t("Select a project to load audit history.") });
      return undefined;
    }
    const controller = new AbortController();
    setRequestState({ loading: true, error: "" });
    listAudit(context, { limit: AUDIT_PAGE_SIZE, offset: 0 }, controller.signal)
      .then((response) => {
        setEvents(response.items);
        setTotal(response.total);
        setRequestState({ loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setEvents([]);
        setTotal(0);
        setRequestState({ loading: false, error: error instanceof Error ? error.message : t("Audit history could not be loaded") });
      });
    return () => controller.abort();
  }, [context?.tenantId, context?.projectId, reloadToken]);

  const filteredEvents = useMemo(() => {
    if (!deferredQuery) return events;
    return events.filter((event) => auditSearchText(event).includes(deferredQuery));
  }, [deferredQuery, events]);

  async function loadMore() {
    if (!context || loadingMore || events.length >= total) return;
    setLoadingMore(true);
    setRequestState((current) => ({ ...current, error: "" }));
    try {
      const response = await listAudit(context, { limit: AUDIT_PAGE_SIZE, offset: events.length });
      setEvents((current) => {
        const knownIds = new Set(current.map((event) => event.id));
        return [...current, ...response.items.filter((event) => !knownIds.has(event.id))];
      });
      setTotal(response.total);
    } catch (error) {
      setRequestState((current) => ({ ...current, error: error instanceof Error ? error.message : t("More audit events could not be loaded") }));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="section-workspace">
      <SectionHeading
        eyebrow={t("Immutable operational evidence")}
        title={t("Audit")}
        description={t("Trace actors, actions, entities, timestamps, and correlation IDs across ingestion and workspace changes.")}
        icon={<ShieldCheck size={24} />}
      />
      <div className="section-toolbar">
        <label className="section-search"><Search size={16} /><span className="sr-only">{t("Filter loaded audit events")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Filter actor, action, entity, or correlation ID")} /></label>
        <span className="section-result-count">{filteredEvents.length} shown · {events.length} loaded · {total} total</span>
      </div>
      {requestState.loading ? <LoadState message={t("Loading audit history…")} /> : null}
      {requestState.error && events.length === 0 ? <LoadState message={requestState.error} onRetry={() => setReloadToken((value) => value + 1)} /> : null}
      {!requestState.loading && !requestState.error && filteredEvents.length === 0 ? <LoadState message={query ? t("No loaded audit events match this filter.") : t("No audit events are available.")} /> : null}
      {filteredEvents.length > 0 ? <ol className="governance-list" aria-label={t("Audit events")}>{filteredEvents.map((event) => <AuditRow key={event.id} event={event} />)}</ol> : null}
      {events.length < total ? <button className="section-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? t("Loading…") : t("Load more ({count} remaining)", { count: total - events.length })}</button> : null}
      {requestState.error && events.length > 0 ? <p className="inline-section-error" role="alert">{requestState.error}</p> : null}
    </main>
  );
}

export type CapabilityState =
  | { status: "loading"; message: string }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };

const capabilityIcons = {
  Sources: <Database size={24} />,
  Pipelines: <Workflow size={24} />,
  Models: <Box size={24} />,
} as const;

const capabilityEyebrows = {
  Sources: t("Connected data"),
  Pipelines: t("Operational processing"),
  Models: t("Canonical semantics"),
} as const;

export function CapabilityWorkspace({
  capability,
  state,
}: {
  capability: keyof typeof capabilityIcons;
  state: CapabilityState;
}) {
  return (
    <main className="section-workspace">
      <SectionHeading
        eyebrow={capabilityEyebrows[capability]}
        title={capability}
        description={t("This surface is wired for explicit loading, empty, and failure states while its read API is being defined.")}
        icon={capabilityIcons[capability]}
      />
      <div className={`capability-state is-${state.status}`} role={state.status === "error" ? "alert" : "status"}>
        {state.status === "loading" ? <Activity className="spin" size={22} /> : <FileClock size={22} />}
        <div><strong>{state.status === "loading" ? t("Loading") : state.status === "error" ? t("Unavailable") : t("No data source configured")}</strong><p>{state.message}</p></div>
      </div>
    </main>
  );
}
