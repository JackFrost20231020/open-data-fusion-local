import {
  AtSign,
  Check,
  ChevronRight,
  Circle,
  Copy,
  CornerDownRight,
  Link2,
  Lock,
  MessageSquare,
  PanelRightClose,
  Plus,
  Reply,
  Search,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AssetDetailResponse, PlatformContext } from "../types";
import { listAssets, listProjectTimeSeries, getAsset, type ProjectTimeSeriesOption } from "../lib/api";
import type { CanvasComment, CanvasWidget, CanvasWidgetKind, IndustrialCanvasState } from "./industrialCanvas";
import { createThresholdRule, thresholdLabel, type CanvasThresholdRule } from "./chartThresholds";
import { CauseNodeInspector } from "./CauseMapWidget";
import type { IndustrialEvent } from "../types";
import { formatDateTime, t } from "../i18n";

export interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filtered = useMemo(() => commands.filter((command) => `${command.label} ${command.description}`.toLowerCase().includes(query.trim().toLowerCase())), [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;
  return (
    <div className="industrial-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="industrial-command-palette" role="dialog" aria-modal="true" aria-label={t("Canvas command palette")} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => filtered.length ? (index + 1) % filtered.length : 0); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => filtered.length ? (index - 1 + filtered.length) % filtered.length : 0); }
        if (event.key === "Enter" && filtered[activeIndex]) { event.preventDefault(); filtered[activeIndex].run(); onClose(); }
      }}>
        <div><Search size={17} /><input ref={inputRef} aria-label={t("Search commands")} placeholder={t("Add a widget or run an action…")} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} /><kbd>Esc</kbd></div>
        <ul role="listbox" aria-label={t("Canvas commands")}>
          {filtered.map((command, index) => <li key={command.id}><button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "is-active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => { command.run(); onClose(); }}><span>{command.icon}</span><div><strong>{command.label}</strong><small>{command.description}</small></div><ChevronRight size={15} /></button></li>)}
          {!filtered.length ? <li className="industrial-command-empty">{t("No matching commands")}</li> : null}
        </ul>
      </section>
    </div>
  );
}

function CommentsPanel({ comments, selectedCommentId, onAdd, onUpdate, onDelete, onNavigate }: { comments: CanvasComment[]; selectedCommentId: string | null; onAdd: (body: string) => void; onUpdate: (id: string, patch: Partial<CanvasComment>) => void; onDelete: (id: string) => void; onNavigate: (comment: CanvasComment) => void }) {
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [draft, setDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const visible = comments.filter((comment) => comment.resolved === (filter === "resolved"));

  function addReply(comment: CanvasComment) {
    const body = replyDraft[comment.id]?.trim();
    if (!body) return;
    onUpdate(comment.id, { replies: [...comment.replies, { id: `${comment.id}-${Date.now()}`, author: t("You"), body, createdAt: new Date().toISOString() }] });
    setReplyDraft((current) => ({ ...current, [comment.id]: "" }));
  }

  return (
    <div className="industrial-comments-panel">
      <div className="industrial-comment-filter" role="tablist" aria-label={t("Comment filter")}><button type="button" role="tab" aria-selected={filter === "open"} onClick={() => setFilter("open")}>{t("Open")} <span>{comments.filter((comment) => !comment.resolved).length}</span></button><button type="button" role="tab" aria-selected={filter === "resolved"} onClick={() => setFilter("resolved")}>{t("Resolved")} <span>{comments.filter((comment) => comment.resolved).length}</span></button></div>
      <form className="industrial-new-comment" onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; onAdd(draft.trim()); setDraft(""); }}><textarea aria-label={t("New canvas comment")} rows={3} placeholder={t("Add a comment. Use @ to mention someone.")} value={draft} onChange={(event) => setDraft(event.target.value)} /><div><AtSign size={14} /><span>{t("Comments are saved locally")}</span><button type="submit" disabled={!draft.trim()}><Plus size={14} /> {t("Add")}</button></div></form>
      <div className="industrial-comment-list">
        {!visible.length ? <div className="industrial-panel-empty"><MessageSquare size={22} /><strong>{filter === "open" ? t("No open comments") : t("No resolved comments")}</strong><span>{filter === "open" ? t("Place a pin on the canvas to start a thread.") : t("Resolved discussions will appear here.")}</span></div> : null}
        {visible.map((comment) => <article key={comment.id} className={selectedCommentId === comment.id ? "is-selected" : ""}>
          <header><span className="industrial-comment-avatar">YO</span><div><strong>{comment.author}</strong><time>{formatDateTime(comment.createdAt)}</time></div><button type="button" aria-label={t("Go to comment on canvas")} onClick={() => onNavigate(comment)}><CornerDownRight size={14} /></button></header>
          {editingId === comment.id ? <form onSubmit={(event) => { event.preventDefault(); if (editingBody.trim()) onUpdate(comment.id, { body: editingBody.trim() }); setEditingId(null); }}><textarea autoFocus aria-label={t("Edit comment")} value={editingBody} onChange={(event) => setEditingBody(event.target.value)} /><button type="submit">{t("Save")}</button><button type="button" onClick={() => setEditingId(null)}>{t("Cancel")}</button></form> : <p>{comment.body}</p>}
          {comment.replies.map((reply) => <div className="industrial-comment-reply" key={reply.id}><Reply size={13} /><div><strong>{reply.author}</strong><p>{reply.body}</p></div></div>)}
          <div className="industrial-comment-actions"><button type="button" onClick={() => onUpdate(comment.id, { reactions: comment.reactions + 1 })}><SmilePlus size={13} /> {comment.reactions || "React"}</button><button type="button" onClick={() => onUpdate(comment.id, { resolved: !comment.resolved })}><Check size={13} /> {comment.resolved ? "Reopen" : "Resolve"}</button><button type="button" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body); }}>{t("Edit")}</button><button type="button" aria-label={t("Delete comment")} onClick={() => onDelete(comment.id)}><Trash2 size={13} /></button></div>
          <div className="industrial-reply-box"><input aria-label={`Reply to ${comment.author}`} placeholder={t("Reply or @mention")} value={replyDraft[comment.id] ?? ""} onChange={(event) => setReplyDraft((current) => ({ ...current, [comment.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); addReply(comment); } }} /><button type="button" aria-label={t("Send reply")} onClick={() => addReply(comment)}><Reply size={14} /></button></div>
        </article>)}
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><input type="number" min={min} max={max} value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function PropertiesPanel({ canvas, selected, onRenameCanvas, onUpdateSelected, onConnectData, events = [], assets = [], series = [], selectedCauseNodeId = null }: { canvas: IndustrialCanvasState; selected: CanvasWidget[]; onRenameCanvas: (title: string) => void; onUpdateSelected: (patch: Partial<CanvasWidget>) => void; onConnectData: () => void; events?: IndustrialEvent[]; assets?: Array<{ externalId: string; name: string }>; series?: Array<{ externalId: string; name: string }>; selectedCauseNodeId?: string | null }) {
  if (!selected.length) {
    return (
      <div className="industrial-properties-panel">
        <section><h3>{t("Canvas")}</h3><label><span>{t("Name")}</span><input value={canvas.title} onChange={(event) => onRenameCanvas(event.target.value)} /></label><div className="industrial-property-grid"><NumberField label="X" value={canvas.viewport.x} onChange={() => undefined} /><NumberField label="Y" value={canvas.viewport.y} onChange={() => undefined} /></div><label><span>{t("Zoom")}</span><input readOnly value={`${Math.round(canvas.viewport.zoom * 100)}%`} /></label></section>
        <section><h3>{t("Appearance")}</h3><div className="industrial-canvas-swatch"><i /><div><strong>{t("Infinite dotted grid")}</strong><span>{t("Graphite shell · cobalt accent")}</span></div></div></section>
        <div className="industrial-panel-empty"><MousePointerHint /><strong>{t("No widget selected")}</strong><span>{t("Select a widget to edit its appearance and data source.")}</span></div>
      </div>
    );
  }
  const widget = selected[0];
  return (
    <div className="industrial-properties-panel">
      {selected.length > 1 ? <p className="industrial-selection-summary">{selected.length} widgets selected. Shared changes apply to all.</p> : null}
      <section><h3>{t("Widget")}</h3><label><span>{t("Name")}</span><input value={widget.title} onChange={(event) => onUpdateSelected({ title: event.target.value })} /></label><div className="industrial-property-grid"><NumberField label="X" value={widget.x} onChange={(x) => onUpdateSelected({ x })} /><NumberField label="Y" value={widget.y} onChange={(y) => onUpdateSelected({ y })} /><NumberField label="Width" min={160} value={widget.width} onChange={(width) => onUpdateSelected({ width: Math.max(160, width) })} /><NumberField label="Height" min={90} value={widget.height} onChange={(height) => onUpdateSelected({ height: Math.max(90, height) })} /></div></section>
      <section><h3>{t("Appearance")}</h3><div className="industrial-color-fields"><label><span>{t("Background")}</span><input type="color" value={widget.background} onChange={(event) => onUpdateSelected({ background: event.target.value })} /></label><label><span>{t("Border")}</span><input type="color" value={widget.borderColor} onChange={(event) => onUpdateSelected({ borderColor: event.target.value })} /></label></div><label><span>{t("Opacity · {percent}%", { percent: Math.round(widget.opacity * 100) })}</span><input type="range" min="0.25" max="1" step="0.05" value={widget.opacity} onChange={(event) => onUpdateSelected({ opacity: Number(event.target.value) })} /></label><button type="button" className="industrial-property-toggle" aria-pressed={widget.locked} onClick={() => onUpdateSelected({ locked: !widget.locked })}><Lock size={14} />{widget.locked ? t("Locked") : t("Unlocked")}<span>{widget.locked ? t("On") : t("Off")}</span></button></section>
      {widget.kind === "causeMap" ? <section><h3>因果图</h3><p className="industrial-selection-summary">在根节点下构建故障树，添加节点后会自动对齐。拖动根节点可移动整棵树。按一层展开或收起子节点；过滤会把不匹配的连线调暗而不是隐藏。</p><div className="industrial-cause-layout" role="radiogroup" aria-label={t("Cause map layout")}><button type="button" aria-pressed={(widget.data.causeLayout ?? "horizontal") === "horizontal"} onClick={() => onUpdateSelected({ data: { ...widget.data, causeLayout: "horizontal" } })}>{t("Horizontal")}</button><button type="button" aria-pressed={widget.data.causeLayout === "vertical"} onClick={() => onUpdateSelected({ data: { ...widget.data, causeLayout: "vertical" } })}>{t("Vertical")}</button></div><CauseNodeInspector widget={widget} selectedNodeId={selectedCauseNodeId} events={events} assets={assets} series={series} onUpdateNodes={(causeNodes) => onUpdateSelected({ data: { ...widget.data, causeNodes } })} /></section> : null}
      {widget.kind === "causeMap" ? null : <section><h3>{t("Data source")}</h3><div className="industrial-data-source-field"><Link2 size={15} /><div><strong>{widget.data.connected ? widget.data.sourceLabel ?? "Connected source" : "Not connected"}</strong><span>{widget.data.connected ? "Governed project data" : "Select a project source"}</span></div><button type="button" onClick={onConnectData}>{widget.data.connected ? "Change" : "Connect"}</button></div></section>}
      {widget.kind === "chart" || widget.kind === "timeSeries" ? <ThresholdRulesEditor widget={widget} onUpdate={(thresholds) => onUpdateSelected({ data: { ...widget.data, thresholds } })} /> : null}
    </div>
  );
}


function ThresholdRulesEditor({ widget, onUpdate }: { widget: CanvasWidget; onUpdate: (thresholds: CanvasThresholdRule[]) => void }) {
  const rules = widget.data.thresholds ?? [];
  const series = widget.data.connectedSeries ?? [];
  const bound = series.length > 0;

  function addRule(direction: CanvasThresholdRule["direction"]) {
    const first = series[0];
    onUpdate([...rules, createThresholdRule(direction, direction === "high" ? 0 : 0, { seriesExternalId: first?.externalId })]);
  }

  function updateRule(id: string, patch: Partial<CanvasThresholdRule>) {
    onUpdate(rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  }

  function removeRule(id: string) {
    onUpdate(rules.filter((rule) => rule.id !== id));
  }

  return (
    <section className="industrial-threshold-editor" aria-label={t("Threshold rules")}>
      <h3>{t("Thresholds")}</h3>
      {!bound ? <p className="industrial-selection-summary">{t("Connect a time series before adding threshold rules.")}</p> : null}
      {bound && !rules.length ? <p className="industrial-selection-summary">{t("Set a high or low value to draw a threshold line and color any breaches on the chart.")}</p> : null}
      {rules.map((rule) => (
        <div key={rule.id} className="industrial-threshold-rule">
          <label><span>{t("Direction")}</span><select value={rule.direction} onChange={(event) => updateRule(rule.id, { direction: event.target.value as CanvasThresholdRule["direction"] })}><option value="high">{t("High")}</option><option value="low">{t("Low")}</option></select></label>
          <label><span>{t("Value")}</span><input type="number" step="any" value={Number.isFinite(rule.value) ? rule.value : ""} aria-label={t(`${rule.direction} threshold value`)} onChange={(event) => updateRule(rule.id, { value: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /></label>
          <label><span>{t("Color")}</span><input type="color" value={rule.color} aria-label={t(`${rule.direction} threshold color`)} onChange={(event) => updateRule(rule.id, { color: event.target.value })} /></label>
          {series.length > 1 ? <label className="industrial-threshold-series"><span>{t("Series")}</span><select value={rule.seriesExternalId ?? series[0]?.externalId ?? ""} onChange={(event) => updateRule(rule.id, { seriesExternalId: event.target.value })}>{series.map((item) => <option key={item.externalId} value={item.externalId}>{item.name}</option>)}</select></label> : null}
          <button type="button" aria-label={t("Remove {label}", { label: thresholdLabel(rule, series.find((item) => item.externalId === rule.seriesExternalId)?.unit ?? series[0]?.unit) })} onClick={() => removeRule(rule.id)}><Trash2 size={13} /></button>
        </div>
      ))}
      <div className="industrial-threshold-actions">
        <button type="button" disabled={!bound} onClick={() => addRule("high")}><Plus size={13} />{t("Add high")}</button>
        <button type="button" disabled={!bound} onClick={() => addRule("low")}><Plus size={13} />{t("Add low")}</button>
      </div>
    </section>
  );
}

function MousePointerHint() {
  return <Circle size={22} />;
}

export function CanvasInspector({ open, tab, canvas, selected, comments, selectedCommentId, onTabChange, onClose, onRenameCanvas, onUpdateSelected, onConnectData, events = [], assets = [], series = [], selectedCauseNodeId = null, onAddComment, onUpdateComment, onDeleteComment, onNavigateComment }: {
  open: boolean;
  tab: "comments" | "properties";
  canvas: IndustrialCanvasState;
  selected: CanvasWidget[];
  comments: CanvasComment[];
  selectedCommentId: string | null;
  onTabChange: (tab: "comments" | "properties") => void;
  onClose: () => void;
  onRenameCanvas: (title: string) => void;
  onUpdateSelected: (patch: Partial<CanvasWidget>) => void;
  onConnectData: () => void;
  events?: IndustrialEvent[];
  assets?: Array<{ externalId: string; name: string }>;
  series?: Array<{ externalId: string; name: string }>;
  selectedCauseNodeId?: string | null;
  onAddComment: (body: string) => void;
  onUpdateComment: (id: string, patch: Partial<CanvasComment>) => void;
  onDeleteComment: (id: string) => void;
  onNavigateComment: (comment: CanvasComment) => void;
}) {
  return (
    <aside className={`industrial-inspector${open ? " is-open" : ""}`} aria-label={t("Canvas inspector")}>
      <header><div role="tablist" aria-label={t("Inspector panels")}><button type="button" role="tab" aria-selected={tab === "properties"} onClick={() => onTabChange("properties")}>{t("Properties")}</button><button type="button" role="tab" aria-selected={tab === "comments"} onClick={() => onTabChange("comments")}>{t("Comments")} <span>{comments.filter((comment) => !comment.resolved).length}</span></button></div><button type="button" aria-label={t("Close inspector")} onClick={onClose}><PanelRightClose size={17} /></button></header>
      {tab === "properties" ? <PropertiesPanel canvas={canvas} selected={selected} onRenameCanvas={onRenameCanvas} onUpdateSelected={onUpdateSelected} onConnectData={onConnectData} events={events} assets={assets} series={series} selectedCauseNodeId={selectedCauseNodeId} /> : <CommentsPanel comments={comments} selectedCommentId={selectedCommentId} onAdd={onAddComment} onUpdate={onUpdateComment} onDelete={onDeleteComment} onNavigate={onNavigateComment} />}
    </aside>
  );
}

export function CanvasContextMenu({ x, y, canPaste, selectionCount, onAdd, onPaste, onDuplicate, onGroup, onForward, onBackward, onClose }: { x: number; y: number; canPaste: boolean; selectionCount: number; onAdd: (kind: CanvasWidgetKind) => void; onPaste: () => void; onDuplicate: () => void; onGroup: () => void; onForward: () => void; onBackward: () => void; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("blur", close); };
  }, [onClose]);
  return <div className="industrial-context-menu" role="menu" style={{ left: x, top: y }} onPointerDown={(event) => event.stopPropagation()}><button type="button" role="menuitem" onClick={() => onAdd("note")}><Plus size={14} />{t("Add note")}</button><button type="button" role="menuitem" onClick={() => onAdd("asset")}><Plus size={14} />{t("Add asset")}</button><button type="button" role="menuitem" onClick={() => onAdd("causeMap")}><Plus size={14} />{t("Add cause map")}</button><button type="button" role="menuitem" onClick={() => onAdd("drawingPage")}><Plus size={14} />{t("Add drawing page")}</button><button type="button" role="menuitem" onClick={() => onAdd("resultsTable")}><Plus size={14} />{t("Add analysis results")}</button><button type="button" role="menuitem" disabled={!canPaste} onClick={onPaste}><Copy size={14} />{t("Paste")}</button><hr /><button type="button" role="menuitem" disabled={!selectionCount} onClick={onDuplicate}>{t("Duplicate selection")}</button><button type="button" role="menuitem" disabled={selectionCount < 2} onClick={onGroup}>{t("Group in frame")}</button><button type="button" role="menuitem" disabled={!selectionCount} onClick={onForward}>{t("Bring forward")}</button><button type="button" role="menuitem" disabled={!selectionCount} onClick={onBackward}>{t("Send backward")}</button></div>;
}

export function ConfirmResetDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!open) return null;
  return <div className="industrial-modal-backdrop" role="presentation"><dialog open className="industrial-confirm-dialog" aria-labelledby="reset-title" onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}><button type="button" aria-label={t("Close reset dialog")} onClick={onCancel}><X size={16} /></button><span><Trash2 size={20} /></span><h2 id="reset-title">{t("Reset this canvas?")}</h2><p>{t("All local widgets, comments and layout changes will be removed. This cannot be undone.")}</p><footer><button type="button" onClick={onCancel}>{t("Cancel")}</button><button type="button" onClick={onConfirm}>{t("Reset canvas")}</button></footer></dialog></div>;
}


export function DataSourcePicker({ open, mode, context, selectedIds, onClose, onConfirmSeries, onConfirmAsset }: {
  open: boolean;
  mode: "series" | "asset";
  context: PlatformContext | null;
  selectedIds: string[];
  onClose: () => void;
  onConfirmSeries: (series: ProjectTimeSeriesOption[]) => void;
  onConfirmAsset: (detail: AssetDetailResponse) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [series, setSeries] = useState<ProjectTimeSeriesOption[]>([]);
  const [assets, setAssets] = useState<Array<{ externalId: string; name: string; type: string; description: string | null }>>([]);
  const [picked, setPicked] = useState<string[]>(selectedIds);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedKey = selectedIds.join("|");
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setPicked(selectedKey ? selectedKey.split("|") : []);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, selectedKey]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setStatus("loading");
    if (!context) {
      setStatus("error");
      setError("Select a tenant and project before connecting industrial data.");
      return;
    }
    const controller = new AbortController();
    const load = mode === "series"
      ? listProjectTimeSeries(context, controller.signal).then((items) => { setSeries(items); setAssets([]); })
      : listAssets(context, { limit: 200 }, controller.signal).then((page) => {
        setAssets(page.items.map((item) => ({ externalId: item.externalId, name: item.name, type: item.type, description: item.description })));
        setSeries([]);
      });
    load.then(() => { if (!controller.signal.aborted) setStatus("ready"); })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(cause instanceof Error ? cause.message : t("Project data could not be loaded"));
      });
    return () => controller.abort();
  }, [open, mode, context]);

  if (!open) return null;

  const normalized = query.trim().toLowerCase();
  const visibleSeries = series.filter((item) => `${item.name} ${item.externalId} ${item.assetName}`.toLowerCase().includes(normalized));
  const visibleAssets = assets.filter((item) => `${item.name} ${item.externalId} ${item.type}`.toLowerCase().includes(normalized));

  function toggleSeries(id: string) {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function confirm() {
    if (mode === "series") {
      const chosen = series.filter((item) => picked.includes(item.externalId));
      if (!chosen.length) return;
      onConfirmSeries(chosen);
      return;
    }
    const assetId = picked[0];
    if (!assetId || !context) return;
    const detail = await getAsset(context, assetId);
    onConfirmAsset(detail);
  }

  return (
    <div className="industrial-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="industrial-source-picker" role="dialog" aria-modal="true" aria-label={t("Select data source")} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
        <header>
          <div>
            <strong>{t("Select data source")}</strong>
            <span>{mode === "series" ? t("Choose governed time series from this project. The selection is saved with the widget.") : t("Choose a governed asset from this project.")}</span>
          </div>
          <button type="button" aria-label={t("Close data source picker")} onClick={onClose}><X size={16} /></button>
        </header>
        <div className="industrial-source-picker-search"><Search size={16} /><input ref={inputRef} aria-label={mode === "series" ? t("Search time series") : t("Search assets")} placeholder={mode === "series" ? t("Search time series or assets…") : t("Search assets…")} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="industrial-source-picker-body">
          {status === "loading" ? <p className="industrial-command-empty">{t("Loading project data…")}</p> : null}
          {status === "error" ? <p className="industrial-command-empty" role="alert">{error}</p> : null}
          {status === "ready" && mode === "series" ? (
            visibleSeries.length ? (
              <ul role="listbox" aria-label={t("Project time series")} aria-multiselectable="true">
                {visibleSeries.map((item) => {
                  const checked = picked.includes(item.externalId);
                  return (
                    <li key={item.externalId}>
                      <label className={checked ? "is-active" : ""}>
                        <input type="checkbox" checked={checked} onChange={() => toggleSeries(item.externalId)} />
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.assetName} · {item.externalId}{item.unit ? ` · ${item.unit}` : ""}</small>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="industrial-command-empty">{t("No time series match this search.")}</p>
          ) : null}
          {status === "ready" && mode === "asset" ? (
            visibleAssets.length ? (
              <ul role="listbox" aria-label={t("Project assets")}>
                {visibleAssets.map((item) => {
                  const checked = picked[0] === item.externalId;
                  return (
                    <li key={item.externalId}>
                      <button type="button" role="option" aria-selected={checked} className={checked ? "is-active" : ""} onClick={() => setPicked([item.externalId])}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.type} · {item.externalId}</small>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="industrial-command-empty">{t("No assets match this search.")}</p>
          ) : null}
        </div>
        <footer>
          <button type="button" onClick={onClose}>{t("Cancel")}</button>
          <button type="button" onClick={() => { void confirm(); }} disabled={status !== "ready" || picked.length === 0}>{t("Connect")}</button>
        </footer>
      </section>
    </div>
  );
}
