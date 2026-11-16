import { formatDateTime, statusLabel, t } from "../i18n";
import type { IndustrialEvent } from "../types";

export function eventStatus(event: IndustrialEvent): string | undefined {
  const value = event.metadata?.status;
  return typeof value === "string" ? value : undefined;
}

export function eventTypeLabel(type: string): string {
  if (type === "alarm") return "报警";
  if (type === "maintenance") return "维护";
  if (type === "work_order") return "工单";
  return type;
}

export function IndustrialEventDetail({ event, onClose, onJump }: {
  event: IndustrialEvent;
  onClose: () => void;
  onJump?: (event: IndustrialEvent) => void;
}) {
  const status = eventStatus(event);
  return (
    <aside className="industrial-event-detail" role="dialog" aria-label={t("Event details")}>
      <header>
        <strong>{t("Event details")}</strong>
        <button type="button" aria-label={t("Close event details")} onClick={onClose}>×</button>
      </header>
      <dl>
        <div><dt>外部 ID</dt><dd>{event.externalId}</dd></div>
        <div><dt>类型</dt><dd>{eventTypeLabel(event.type)}</dd></div>
        {event.subtype ? <div><dt>{t("Subtype")}</dt><dd>{event.subtype}</dd></div> : null}
        {status ? <div><dt>{t("Status")}</dt><dd>{statusLabel(status)}</dd></div> : null}
        <div><dt>开始时间</dt><dd>{formatDateTime(event.startTime)}</dd></div>
        {event.endTime ? <div><dt>结束时间</dt><dd>{formatDateTime(event.endTime)}</dd></div> : null}
        {event.description ? <div><dt>描述</dt><dd>{event.description}</dd></div> : null}
        {event.assetExternalIds.length ? <div><dt>相关资产</dt><dd>{event.assetExternalIds.join(", ")}</dd></div> : null}
      </dl>
      {onJump ? <button type="button" className="industrial-event-jump" onClick={() => onJump(event)}>在图表中定位</button> : null}
    </aside>
  );
}
