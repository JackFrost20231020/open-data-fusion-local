import { ChevronDown, ChevronRight, GitBranch, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { IndustrialEvent } from "../types";
import type { CanvasWidget } from "./industrialCanvas";
import { t } from "../i18n";
import {
  addCauseChild,
  CAUSE_EDGE_TYPES,
  causeMapWidgetSize,
  deleteCauseNode,
  evidenceCount,
  layoutCauseMap,
  nodeIsDimmed,
  setCauseEdgeType,
  toggleCauseCollapsed,
  updateCauseNode,
  type CauseEdgeType,
  type CauseMapLayout,
} from "./causeMap";

interface CauseMapWidgetProps {
  widget: CanvasWidget;
  onUpdate: (patch: Partial<CanvasWidget>) => void;
  onUpdateData: (patch: Partial<CanvasWidget["data"]>) => void;
  onRootPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  events?: IndustrialEvent[];
  selectedCauseNodeId?: string | null;
  onSelectCauseNode?: (id: string | null) => void;
  onSelectEvent?: (event: IndustrialEvent) => void;
  onJumpToEvent?: (event: IndustrialEvent) => void;
}

export function CauseMapWidget({
  widget,
  onUpdate,
  onUpdateData,
  onRootPointerDown,
  events = [],
  selectedCauseNodeId,
  onSelectCauseNode,
  onSelectEvent,
  onJumpToEvent,
}: CauseMapWidgetProps) {
  const layout = (widget.data.causeLayout ?? "horizontal") as CauseMapLayout;
  const nodes = widget.data.causeNodes ?? [];
  const filter = (widget.data.causeEdgeFilter ?? "all") as CauseEdgeType | "all";
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedId = selectedCauseNodeId ?? internalSelected;
  const laidOut = useMemo(() => layoutCauseMap(nodes, layout), [nodes, layout]);

  useEffect(() => {
    const size = causeMapWidgetSize(laidOut);
    if (size.width !== widget.width || size.height !== widget.height) onUpdate(size);
  }, [laidOut, onUpdate, widget.height, widget.width]);

  function selectNode(id: string) {
    setInternalSelected(id);
    onSelectCauseNode?.(id);
  }

  function changeLayout(next: CauseMapLayout) {
    const size = causeMapWidgetSize(layoutCauseMap(nodes, next));
    onUpdate({
      width: size.width,
      height: size.height,
      data: { ...widget.data, causeLayout: next },
    });
  }

  function changeLabel(id: string, label: string) {
    const next = updateCauseNode(nodes, id, { label });
    const root = next.find((node) => node.parentId === null);
    if (root && id === root.id) {
      onUpdate({ title: label.trim() || widget.title, data: { ...widget.data, causeNodes: next } });
      return;
    }
    onUpdateData({ causeNodes: next });
  }

  function addChild(parentId: string) {
    const next = addCauseChild(nodes, parentId, "New cause");
    const added = next[next.length - 1];
    onUpdateData({ causeNodes: next });
    if (added) selectNode(added.id);
  }

  function removeNode(id: string) {
    const next = deleteCauseNode(nodes, id);
    onUpdateData({ causeNodes: next });
    if (selectedId === id) {
      setInternalSelected(null);
      onSelectCauseNode?.(null);
    }
  }

  return (
    <div className={`industrial-cause-map is-${layout}`}>
      <div className="industrial-cause-toolbar" onPointerDown={(event) => event.stopPropagation()}>
        <GitBranch size={13} />
        <span>因果图</span>
        <div className="industrial-cause-layout" role="radiogroup" aria-label={t("Cause map layout")}>
          <button type="button" aria-pressed={layout === "horizontal"} onClick={() => changeLayout("horizontal")}>{t("Horizontal")}</button>
          <button type="button" aria-pressed={layout === "vertical"} onClick={() => changeLayout("vertical")}>{t("Vertical")}</button>
        </div>
        <div className="industrial-cause-filter" role="radiogroup" aria-label="连线类型过滤">
          <button type="button" aria-pressed={filter === "all"} onClick={() => onUpdateData({ causeEdgeFilter: "all" })}>全部</button>
          {CAUSE_EDGE_TYPES.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => onUpdateData({ causeEdgeFilter: item.id })} style={{ color: item.color }}>{item.label}</button>
          ))}
        </div>
      </div>
      <div className="industrial-cause-surface" style={{ minWidth: laidOut.width, minHeight: laidOut.height }}>
        <svg className="industrial-cause-edges" width={laidOut.width} height={Math.max(0, laidOut.height - 36)} aria-hidden="true">
          {laidOut.edges.map((edge) => {
            const dimmed = filter !== "all" && edge.edgeType !== filter;
            return (
              <g key={edge.id} className={dimmed ? "is-dimmed" : undefined} opacity={dimmed ? 0.22 : 1}>
                <path d={edge.path} stroke={edge.color} strokeDasharray={edge.dasharray} fill="none" strokeWidth="1.6" />
                <text x={edge.labelX} y={edge.labelY - 4} textAnchor="middle" fill={edge.color} fontSize="8" fontWeight="700">{edge.label}</text>
              </g>
            );
          })}
        </svg>
        {laidOut.boxes.map((box) => {
          const selected = selectedId === box.id;
          const dimmed = nodeIsDimmed(nodes, box.id, filter);
          const count = evidenceCount(box.evidence);
          return (
            <article
              key={box.id}
              className={`industrial-cause-node${box.isRoot ? " is-root" : ""}${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${box.collapsed ? " is-collapsed" : ""}`}
              style={{ width: box.width, height: box.height, transform: `translate(${box.x}px, ${box.y}px)`, opacity: dimmed ? 0.28 : 1 }}
              aria-label={box.isRoot ? `Root cause: ${box.label}` : `Cause: ${box.label}`}
              onPointerDown={(event) => {
                if (box.isRoot && !(event.target as HTMLElement).closest("input, textarea, button")) {
                  onRootPointerDown(event);
                  return;
                }
                event.stopPropagation();
              }}
              onClick={(event) => { event.stopPropagation(); selectNode(box.id); }}
            >
              {box.isRoot ? <span className="industrial-cause-grip" title={t("Drag the root to move the entire cause map")}><GripVertical size={13} /></span> : null}
              {box.childCount > 0 ? (
                <button
                  type="button"
                  className="industrial-cause-collapse"
                  aria-label={box.collapsed ? `展开 ${box.label}` : `收起 ${box.label}`}
                  aria-expanded={!box.collapsed}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); onUpdateData({ causeNodes: toggleCauseCollapsed(nodes, box.id) }); }}
                >
                  {box.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {box.collapsed ? <span className="industrial-cause-count">{box.childCount}</span> : null}
                </button>
              ) : null}
              <div className="industrial-cause-fields">
                {box.isRoot ? <small>{t("Root cause")}</small> : <small>{CAUSE_EDGE_TYPES.find((item) => item.id === (box.edgeType ?? "causes"))?.label ?? t("Cause")}</small>}
                <textarea
                  aria-label={box.isRoot ? t("Root cause label") : t("Cause label")}
                  rows={2}
                  value={box.label}
                  onChange={(event) => changeLabel(box.id, event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              </div>
              {count ? (
                <div className="industrial-cause-evidence">
                  {(box.evidence?.events ?? []).map((eventId) => {
                    const event = events.find((item) => item.externalId === eventId);
                    return (
                      <button
                        key={eventId}
                        type="button"
                        className="industrial-evidence-chip is-event"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(click) => {
                          click.stopPropagation();
                          if (event) {
                            onSelectEvent?.(event);
                            onJumpToEvent?.(event);
                          }
                        }}
                      >{event?.type === "maintenance" ? "工单" : "事件"} {eventId.replace(/^EVT-/, "")}</button>
                    );
                  })}
                  {(box.evidence?.assets ?? []).map((assetId) => (
                    <span key={assetId} className="industrial-evidence-chip is-asset">{assetId}</span>
                  ))}
                  {(box.evidence?.documents ?? []).map((fileName) => (
                    <span key={fileName} className="industrial-evidence-chip is-document">{fileName}</span>
                  ))}
                  {(box.evidence?.drawingElements ?? []).map((nodeId) => (
                    <span key={nodeId} className="industrial-evidence-chip is-drawing">{t("Drawing")} {nodeId}</span>
                  ))}
                  {(box.evidence?.timeSeries ?? []).map((seriesId) => (
                    <span key={seriesId} className="industrial-evidence-chip is-series">{seriesId}</span>
                  ))}
                </div>
              ) : null}
              <div className="industrial-cause-actions">
                <button type="button" aria-label={t("Add cause under {label}", { label: box.label })} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addChild(box.id); }}>
                  <Plus size={12} />
                </button>
                {box.isRoot ? null : (
                  <button type="button" className="is-danger" aria-label={`Delete cause ${box.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeNode(box.id); }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function CauseNodeInspector({
  widget,
  selectedNodeId,
  events,
  assets,
  series,
  onUpdateNodes,
}: {
  widget: CanvasWidget;
  selectedNodeId: string | null;
  events: IndustrialEvent[];
  assets: Array<{ externalId: string; name: string }>;
  series: Array<{ externalId: string; name: string }>;
  onUpdateNodes: (nodes: NonNullable<CanvasWidget["data"]["causeNodes"]>) => void;
}) {
  const nodes = widget.data.causeNodes ?? [];
  const node = nodes.find((item) => item.id === selectedNodeId);
  if (!node) {
    return <p className="industrial-selection-summary">在因果图上选择一个节点，即可挂接资产、事件或时间序列作为证据，并设置连线类型。</p>;
  }
  const evidence = node.evidence ?? {};

  function toggle(list: string[] | undefined, id: string): string[] {
    const current = list ?? [];
    return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  }

  return (
    <div className="industrial-cause-evidence-editor">
      {node.parentId ? (
        <label>
          <span>连线类型</span>
          <select value={node.edgeType ?? "causes"} onChange={(event) => onUpdateNodes(setCauseEdgeType(nodes, node.id, event.target.value as CauseEdgeType))} aria-label="连线类型">
            {CAUSE_EDGE_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      ) : null}
      <p className="industrial-selection-summary">证据</p>
      <div className="industrial-evidence-picker">
        <strong>事件</strong>
        {events.length ? events.map((event) => (
          <label key={event.externalId} className="industrial-evidence-option">
            <input type="checkbox" checked={Boolean(evidence.events?.includes(event.externalId))} onChange={() => onUpdateNodes(updateCauseNode(nodes, node.id, { evidence: { ...evidence, events: toggle(evidence.events, event.externalId) } }))} />
            <span>{event.description ?? event.externalId}</span>
          </label>
        )) : <small>当前窗口没有事件</small>}
        <strong>资产</strong>
        {assets.length ? assets.map((asset) => (
          <label key={asset.externalId} className="industrial-evidence-option">
            <input type="checkbox" checked={Boolean(evidence.assets?.includes(asset.externalId))} onChange={() => onUpdateNodes(updateCauseNode(nodes, node.id, { evidence: { ...evidence, assets: toggle(evidence.assets, asset.externalId) } }))} />
            <span>{asset.name}</span>
          </label>
        )) : <small>没有可挂接的资产</small>}
        <strong>时间序列</strong>
        {series.length ? series.map((item) => (
          <label key={item.externalId} className="industrial-evidence-option">
            <input type="checkbox" checked={Boolean(evidence.timeSeries?.includes(item.externalId))} onChange={() => onUpdateNodes(updateCauseNode(nodes, node.id, { evidence: { ...evidence, timeSeries: toggle(evidence.timeSeries, item.externalId) } }))} />
            <span>{item.name}</span>
          </label>
        )) : <small>没有可挂接的时间序列</small>}
      </div>
    </div>
  );
}
