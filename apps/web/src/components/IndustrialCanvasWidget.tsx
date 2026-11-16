import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bot,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  CircleHelp,
  ClipboardList,
  Copy,
  Cuboid,
  Download,
  Expand,
  Eye,
  FileChartColumn,
  FileText,
  GitBranch,
  Focus,
  Hand,
  Image,
  Layers2,
  Link2,
  Lock,
  MessageSquare,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Orbit,
  PanelLeft,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  Type,
  Unlock,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
  Map as MapIcon,
  Table2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { ExplorerSnapshot } from "../types";
import type { CanvasWidget, CanvasWidgetKind, ChartMode } from "./industrialCanvas";
import { DrawingPageWidget } from "./DrawingPageWidget";
import { ResultsTableWidget } from "./ResultsTableWidget";
import type { PlatformContext } from "../types";
import { CauseMapWidget } from "./CauseMapWidget";
import { evaluateThresholds } from "./chartThresholds";
import { TimeSeriesChart } from "./TimeSeriesChart";
import type { IndustrialEvent } from "../types";
import { t } from "../i18n";

export type WidgetAction = "duplicate" | "lock" | "forward" | "backward" | "remove" | "collapse";

interface IndustrialCanvasWidgetProps {
  widget: CanvasWidget;
  selected: boolean;
  telemetry: ExplorerSnapshot["telemetry"] | null;
  telemetryStatus?: "idle" | "loading" | "error" | "ready";
  onRetryTelemetry?: () => void;
  connectedSourceTitles: string[];
  onSelect: (additive: boolean) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onResizePointerDown: (event: React.PointerEvent<HTMLSpanElement>) => void;
  onUpdate: (patch: Partial<CanvasWidget>) => void;
  onAction: (action: WidgetAction) => void;
  onConnectData: () => void;
  onAddWidget: (kind: CanvasWidgetKind) => void;
  onAddComment: () => void;
  onOpenExplorer: () => void;
  onNotify: (message: string) => void;
  events?: IndustrialEvent[];
  onSelectEvent?: (event: IndustrialEvent) => void;
  onJumpToEvent?: (event: IndustrialEvent) => void;
  selectedCauseNodeId?: string | null;
  onSelectCauseNode?: (id: string | null) => void;
  platformContext?: import("../types").PlatformContext | null;
}

const widgetIcons: Record<CanvasWidgetKind, LucideIcon> = {
  text: Type,
  note: StickyNote,
  image: Image,
  document: FileText,
  chart: FileChartColumn,
  timeSeries: Layers2,
  model3d: Cuboid,
  asset: Box,
  ai: Sparkles,
  comment: MessageSquare,
  frame: ClipboardList,
  causeMap: GitBranch,
  drawingPage: MapIcon,
  resultsTable: Table2,
};

function EmptyState({ icon: Icon, title, body, action, onAction }: { icon: LucideIcon; title: string; body: string; action: string; onAction: () => void }) {
  return (
    <div className="industrial-widget-empty">
      <span><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{body}</p>
      <button type="button" onClick={onAction}>{action}</button>
    </div>
  );
}

function ViewerToolbar({ page, zoom, onUpdate, fileUrl, fileName, onComment }: { page?: number; zoom: number; onUpdate: (patch: Partial<CanvasWidget["data"]>) => void; fileUrl?: string; fileName?: string; onComment: () => void }) {
  function fullScreen(event: React.MouseEvent<HTMLButtonElement>) {
    void event.currentTarget.closest(".industrial-widget")?.requestFullscreen?.();
  }

  return (
    <div className="industrial-viewer-toolbar" aria-label={t("Viewer controls")}>
      {page ? <><button type="button" aria-label={t("Previous page")} onClick={() => onUpdate({ page: Math.max(1, page - 1) })}><ChevronLeft size={14} /></button><span>{t("Page {page}", { page })}</span><button type="button" aria-label={t("Next page")} onClick={() => onUpdate({ page: page + 1 })}><ChevronRight size={14} /></button></> : null}
      <button type="button" aria-label={t("Zoom out")} onClick={() => onUpdate({ viewerZoom: Math.max(0.5, zoom - 0.15) })}><ZoomOut size={14} /></button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label={t("Zoom in")} onClick={() => onUpdate({ viewerZoom: Math.min(2.5, zoom + 0.15) })}><ZoomIn size={14} /></button>
      <button type="button" aria-label={t("Fit width")} onClick={() => onUpdate({ viewerZoom: 1 })}><Focus size={14} /></button>
      <button type="button" aria-label={t("Add annotation")} onClick={onComment}><MessageSquare size={14} /></button>
      <button type="button" aria-label={t("Full screen")} onClick={fullScreen}><Expand size={14} /></button>
      {fileUrl ? <a aria-label={t("Download file")} download={fileName} href={fileUrl}><Download size={14} /></a> : null}
    </div>
  );
}

function FileViewer({ widget, onUpdate, onComment, onNotify }: { widget: CanvasWidget; onUpdate: (patch: Partial<CanvasWidget["data"]>) => void; onComment: () => void; onNotify: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isImage = widget.kind === "image";
  const accept = isImage ? "image/*" : "application/pdf";

  function loadFile(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onNotify(t("Choose a file smaller than 5 MB for local Canvas storage"));
      return;
    }
    if (isImage ? !file.type.startsWith("image/") : file.type !== "application/pdf") {
      onNotify(isImage ? t("Choose an image file") : t("Choose a PDF document"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onUpdate({ fileName: file.name, fileType: file.type, fileUrl: String(reader.result), page: 1, viewerZoom: 1 });
    reader.readAsDataURL(file);
  }

  if (!widget.data.fileUrl) {
    return (
      <button
        type="button"
        className="industrial-drop-zone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); loadFile(event.dataTransfer.files[0]); }}
      >
        <UploadCloud size={28} />
        <strong>Drop {isImage ? "an image" : "a PDF"} here</strong>
        <span>{t("or choose a file from your computer")}</span>
        <input ref={inputRef} hidden type="file" accept={accept} onChange={(event) => loadFile(event.target.files?.[0])} />
      </button>
    );
  }

  const zoom = widget.data.viewerZoom ?? 1;
  return (
    <div className="industrial-viewer">
      <ViewerToolbar page={isImage ? undefined : widget.data.page ?? 1} zoom={zoom} onUpdate={onUpdate} fileUrl={widget.data.fileUrl} fileName={widget.data.fileName} onComment={onComment} />
      <div className="industrial-viewer-surface">
        {isImage ? <img alt={widget.data.fileName ?? t("Uploaded canvas image")} src={widget.data.fileUrl} style={{ transform: `scale(${zoom})` }} /> : <object aria-label={widget.data.fileName ?? t("Uploaded PDF")} data={widget.data.fileUrl} type="application/pdf" style={{ transform: `scale(${zoom})` }}><p>{t("PDF preview is unavailable. Use Download instead.")}</p></object>}
      </div>
      <span className="industrial-file-name">{widget.data.fileName}</span>
    </div>
  );
}

function AssetWidget({ widget, onUpdate, onConnectData, onAddWidget, onOpenExplorer, onAddComment, onNotify }: { widget: CanvasWidget; onUpdate: (patch: Partial<CanvasWidget["data"]>) => void; onConnectData: () => void; onAddWidget: (kind: CanvasWidgetKind) => void; onOpenExplorer: () => void; onAddComment: () => void; onNotify: (message: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (!widget.data.connected) return <EmptyState icon={Box} title={t("No asset connected")} body={t("Connect a governed source to attach context and related data.")} action={t("Connect data source")} onAction={onConnectData} />;
  return (
    <div className="industrial-asset-card">
      <div><span className="industrial-asset-icon"><Box size={24} /></span><div><strong>{widget.data.sourceLabel ?? widget.title}</strong><span>{t("Connected asset")}</span></div><button type="button" aria-label={t("Asset context menu")} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={17} /></button></div>
      <p>{widget.data.description || "No description is available from the connected source."}</p>
      <div className="industrial-source-list"><span>{t("Related data")}</span>{widget.data.sources?.length ? widget.data.sources.map((source) => <button type="button" key={source} onClick={() => onNotify(`${source} selected`)}><Link2 size={13} />{source}</button>) : <small>{t("No related sources yet")}</small>}</div>
      {menuOpen ? <div className="industrial-asset-popover" role="menu"><strong>{widget.data.sourceLabel}</strong><span>{t("Governed asset")}</span><button type="button" role="menuitem" onClick={onOpenExplorer}><Eye size={14} /> {t("View details")}</button><button type="button" role="menuitem" onClick={onOpenExplorer}><ArrowUpToLine size={14} /> {t("Open in Explorer")}</button><button type="button" role="menuitem" onClick={() => { onUpdate({ highlighted: true }); onNotify(t("3D viewer will highlight this asset when a model is connected")); }}><Cuboid size={14} /> {t("Show in 3D")}</button><button type="button" role="menuitem" onClick={onOpenExplorer}><CircleHelp size={14} /> {t("Find related data")}</button><button type="button" role="menuitem" onClick={() => onAddWidget("timeSeries")}><FileChartColumn size={14} /> {t("Add time series")}</button><button type="button" role="menuitem" onClick={onAddComment}><MessageSquare size={14} /> {t("Add comment")}</button></div> : null}
    </div>
  );
}

function ModelViewer({ widget, onUpdate, onConnectData }: { widget: CanvasWidget; onUpdate: (patch: Partial<CanvasWidget["data"]>) => void; onConnectData: () => void }) {
  if (!widget.data.connected) {
    return <EmptyState icon={Cuboid} title={t("No 3D model connected")} body={t("Select a governed model source before using the viewer controls.")} action={t("Select model source")} onAction={onConnectData} />;
  }
  const treeOpen = widget.data.objectTreeOpen !== false;
  const modelTool = widget.data.modelTool ?? "orbit";
  const modelZoom = widget.data.modelZoom ?? 1;
  return (
    <div className="industrial-model-viewer">
      <div className="industrial-model-toolbar" aria-label={t("3D viewer controls")}><button type="button" aria-pressed={modelTool === "orbit"} onClick={() => onUpdate({ modelTool: "orbit" })}><Orbit size={14} />{t("Orbit")}</button><button type="button" aria-pressed={modelTool === "pan"} onClick={() => onUpdate({ modelTool: "pan" })}><Hand size={14} />{t("Pan")}</button><button type="button" aria-label={t("Zoom model in")} onClick={() => onUpdate({ modelZoom: Math.min(2.5, modelZoom + 0.15) })}><ZoomIn size={14} />{t("Zoom")}</button><button type="button" onClick={() => onUpdate({ modelTool: "orbit", modelZoom: 1 })}><RotateCcw size={14} />{t("Reset")}</button><button type="button" onClick={() => onUpdate({ modelZoom: 1 })}><Focus size={14} />{t("Fit")}</button><button type="button" aria-label={t("Toggle object tree")} aria-pressed={treeOpen} onClick={() => onUpdate({ objectTreeOpen: !treeOpen })}><PanelLeft size={14} /></button></div>
      <div className="industrial-model-surface" data-model-tool={modelTool}>{treeOpen ? <aside><strong>{t("Object tree")}</strong><span>{t("No objects")}</span></aside> : null}<div style={{ transform: `scale(${modelZoom})` }}><Cuboid size={30} /><strong>{widget.data.sourceLabel ?? t("Connected source")}</strong><span>{t("No model nodes were returned by this source.")}</span></div></div>
    </div>
  );
}

function AiWidget({ widget, connectedSourceTitles, onUpdate, onConnectData }: { widget: CanvasWidget; connectedSourceTitles: string[]; onUpdate: (patch: Partial<CanvasWidget["data"]>) => void; onConnectData: () => void }) {
  const question = widget.data.aiQuestion ?? "";
  const status = widget.data.aiStatus ?? "idle";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;
    if (!connectedSourceTitles.length) {
      onUpdate({ aiStatus: "ready", aiAnswer: t("Connect a data source before asking questions about this canvas.") });
      return;
    }
    onUpdate({ aiStatus: "loading", aiAnswer: "" });
    window.setTimeout(() => onUpdate({ aiStatus: "ready", aiAnswer: t("The connected sources are ready. Configure an AI service to generate a grounded answer.") }), 650);
  }

  return (
    <form className="industrial-ai-card" onSubmit={submit}>
      <label>{t("Scope")}<select value={widget.data.aiScope ?? "Entire canvas"} onChange={(event) => onUpdate({ aiScope: event.target.value as CanvasWidget["data"]["aiScope"] })}><option value="Selected asset">{t("Selected asset")}</option><option value="Selected documents">{t("Selected documents")}</option><option value="Entire canvas">{t("Entire canvas")}</option></select></label>
      {!connectedSourceTitles.length ? <button type="button" className="industrial-ai-connect" onClick={onConnectData}><Link2 size={14} />{t("Connect data source")}</button> : null}
      <div><Bot size={18} /><textarea aria-label={t("Ask a question")} rows={3} placeholder={t("Ask about connected canvas data")} value={question} onChange={(event) => onUpdate({ aiQuestion: event.target.value })} /><button type="submit" aria-label={t("Send question")} disabled={status === "loading" || !question.trim()}><Send size={15} /></button></div>
      {status === "loading" ? <p className="industrial-ai-status"><Sparkles size={14} /> {t("Reviewing connected sources…")}</p> : null}
      {widget.data.aiAnswer ? <section><strong>{t("Answer")}</strong><p>{widget.data.aiAnswer}</p><footer><span>{t("Sources")}</span>{connectedSourceTitles.length ? connectedSourceTitles.map((source) => <button type="button" key={source}>{source}</button>) : <small>{t("No sources")}</small>}</footer></section> : null}
    </form>
  );
}

function WidgetBody({ widget, telemetry, telemetryStatus, connectedSourceTitles, events, onUpdate, onWidgetUpdate, onRootPointerDown, onConnectData, onRetryTelemetry, onAddWidget, onAddComment, onOpenExplorer, onNotify, onSelectEvent, onJumpToEvent, selectedCauseNodeId, onSelectCauseNode, platformContext }: Pick<IndustrialCanvasWidgetProps, "widget" | "telemetry" | "telemetryStatus" | "connectedSourceTitles" | "events" | "onConnectData" | "onRetryTelemetry" | "onAddWidget" | "onAddComment" | "onOpenExplorer" | "onNotify" | "onSelectEvent" | "onJumpToEvent" | "selectedCauseNodeId" | "onSelectCauseNode" | "platformContext"> & { onUpdate: (patch: Partial<CanvasWidget["data"]>) => void; onWidgetUpdate: (patch: Partial<CanvasWidget>) => void; onRootPointerDown: (event: React.PointerEvent<HTMLElement>) => void }) {
  if (widget.kind === "text" || widget.kind === "note") {
    const placeholder = t(widget.kind === "text" ? "Add text" : "Add a note");
    const legacyPlaceholder = widget.kind === "text" ? "Add text" : "Add a note";
    const value = widget.data.text === placeholder || widget.data.text === legacyPlaceholder ? "" : widget.data.text ?? "";
    return <textarea className="industrial-text-widget" aria-label={t("{title} content", { title: widget.title })} placeholder={placeholder} value={value} onChange={(event) => onUpdate({ text: event.target.value })} />;
  }
  if (widget.kind === "image" || widget.kind === "document") return <FileViewer widget={widget} onUpdate={onUpdate} onComment={onAddComment} onNotify={onNotify} />;
  if (widget.kind === "chart" || widget.kind === "timeSeries") return <TimeSeriesChart widget={widget} telemetry={telemetry} telemetryStatus={telemetryStatus} events={events} onUpdate={onUpdate} onConnectData={onConnectData} onRetryTelemetry={onRetryTelemetry} onSelectEvent={onSelectEvent} />;
  if (widget.kind === "model3d") return <ModelViewer widget={widget} onUpdate={onUpdate} onConnectData={onConnectData} />;
  if (widget.kind === "asset") return <AssetWidget widget={widget} onUpdate={onUpdate} onConnectData={onConnectData} onAddWidget={onAddWidget} onOpenExplorer={onOpenExplorer} onAddComment={onAddComment} onNotify={onNotify} />;
  if (widget.kind === "ai") return <AiWidget widget={widget} connectedSourceTitles={connectedSourceTitles} onUpdate={onUpdate} onConnectData={onConnectData} />;
  if (widget.kind === "comment") return <div className="industrial-comment-widget"><MessageSquare size={20} /><p>{widget.data.text}</p><button type="button" onClick={onAddComment}>{t("Open thread")}</button></div>;
  if (widget.kind === "frame") return <div className="industrial-frame-label">{t("Drop related widgets inside this section")}</div>;
  if (widget.kind === "drawingPage") return <DrawingPageWidget widget={widget} platformContext={platformContext ?? null} onUpdate={onUpdate} />;
  if (widget.kind === "resultsTable") return <ResultsTableWidget widget={widget} platformContext={platformContext ?? null} />;
  if (widget.kind === "causeMap") {
    return <CauseMapWidget widget={widget} onUpdate={onWidgetUpdate} onUpdateData={onUpdate} onRootPointerDown={onRootPointerDown} events={events} selectedCauseNodeId={selectedCauseNodeId} onSelectCauseNode={onSelectCauseNode} onSelectEvent={onSelectEvent} onJumpToEvent={onJumpToEvent} />;
  }
  return null;
}

export function IndustrialCanvasWidget({ widget, selected, telemetry, telemetryStatus, onRetryTelemetry, connectedSourceTitles, onSelect, onPointerDown, onResizePointerDown, onUpdate, onAction, onConnectData, onAddWidget, onAddComment, onOpenExplorer, onNotify, events, onSelectEvent, onJumpToEvent, selectedCauseNodeId, onSelectCauseNode, platformContext }: IndustrialCanvasWidgetProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = widgetIcons[widget.kind];
  const isChart = widget.kind === "chart" || widget.kind === "timeSeries";
  const breach = evaluateThresholds(isChart ? telemetry?.series ?? [] : [], widget.data.thresholds);
  const isBreaching = isChart && breach.anyWindow;
  const breachColor = breach.colors[0] ?? "#d13b2e";
  return (
    <article
      className={`industrial-widget industrial-widget--${widget.kind}${selected ? " is-selected" : ""}${widget.locked ? " is-locked" : ""}${isBreaching ? " is-breaching" : ""}`}
      style={{
        width: widget.width,
        height: widget.collapsed ? 43 : widget.height,
        transform: `translate3d(${widget.x}px, ${widget.y}px, 0)`,
        zIndex: widget.z,
        background: widget.background,
        borderColor: isBreaching ? breachColor : widget.borderColor,
        opacity: widget.opacity,
        ["--breach-color" as string]: isBreaching ? breachColor : undefined,
      }}
      data-widget-id={widget.id}
      tabIndex={0}
      aria-label={t(isBreaching ? (breach.latest ? "{title} {kind} widget, latest value is breaching a threshold" : "{title} {kind} widget, threshold breach in this window") : "{title} {kind} widget", { title: widget.title, kind: t(widget.kind) })}
      aria-selected={selected}
      onClick={(event) => { event.stopPropagation(); onSelect(event.shiftKey || event.metaKey || event.ctrlKey); }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(event.shiftKey || event.metaKey || event.ctrlKey);
        }
      }}
    >
      <header className="industrial-widget-header" onPointerDown={onPointerDown}>
        <span><Icon size={15} strokeWidth={1.8} /></span>
        <strong>{widget.title}</strong>
        {isBreaching ? <span className="industrial-widget-breach" data-testid="threshold-breach-badge">{breach.latest ? t("Latest breach") : t("Breach")}</span> : isChart && widget.data.thresholds?.length ? <span className="industrial-widget-range">{t("In range")}</span> : null}
        {widget.locked ? <Lock size={13} aria-label={t("Locked")} /> : null}
        <button type="button" aria-label={widget.collapsed ? t("Expand widget") : t("Collapse widget")} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onAction("collapse"); }}><ChevronDown size={14} /></button>
        <button type="button" aria-label={t("Widget actions")} aria-expanded={menuOpen} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); }}><MoreHorizontal size={15} /></button>
      </header>
      {!widget.collapsed ? <div className="industrial-widget-body"><WidgetBody widget={widget} telemetry={telemetry} telemetryStatus={telemetryStatus} connectedSourceTitles={connectedSourceTitles} events={events} onUpdate={(data) => onUpdate({ data: { ...widget.data, ...data } })} onWidgetUpdate={onUpdate} onRootPointerDown={onPointerDown} onConnectData={onConnectData} onRetryTelemetry={onRetryTelemetry} onAddWidget={onAddWidget} onAddComment={onAddComment} onOpenExplorer={onOpenExplorer} onNotify={onNotify} onSelectEvent={onSelectEvent} onJumpToEvent={onJumpToEvent} selectedCauseNodeId={selectedCauseNodeId} onSelectCauseNode={onSelectCauseNode} platformContext={platformContext ?? null} /></div> : null}
      {menuOpen ? <div className="industrial-widget-menu" role="menu" onClick={(event) => event.stopPropagation()}><button type="button" role="menuitem" onClick={() => { onAction("duplicate"); setMenuOpen(false); }}><Copy size={14} />{t("Duplicate")}</button><button type="button" role="menuitem" onClick={() => { onAction("lock"); setMenuOpen(false); }}>{widget.locked ? <Unlock size={14} /> : <Lock size={14} />}{widget.locked ? t("Unlock") : t("Lock")}</button><button type="button" role="menuitem" onClick={() => { onAction("forward"); setMenuOpen(false); }}><ChevronsUp size={14} />{t("Bring forward")}</button><button type="button" role="menuitem" onClick={() => { onAction("backward"); setMenuOpen(false); }}><ArrowDownToLine size={14} />{t("Send backward")}</button><button type="button" role="menuitem" className="is-danger" onClick={() => { onAction("remove"); setMenuOpen(false); }}><Trash2 size={14} />{t("Remove")}</button></div> : null}
      {selected && !widget.locked && !widget.collapsed ? <span className="industrial-widget-resize" aria-hidden="true" onPointerDown={onResizePointerDown} /> : null}
    </article>
  );
}
