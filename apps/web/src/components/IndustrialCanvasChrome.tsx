import {
  Bell,
  Bot,
  Box,
  ChartNoAxesCombined,
  Check,
  ClipboardList,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Clock3,
  Cuboid,
  FileText,
  Files,
  Frame,
  GitBranch,
  Map as MapIcon,
  Hand,
  History,
  Home,
  Image,
  Link2,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  MousePointer2,
  Network,
  PanelLeft,
  PanelRight,
  PanelsTopLeft,
  Redo2,
  Search,
  Settings,
  Share2,
  Sparkles,
  StickyNote,
  Type,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import type { CanvasTool, CanvasWidgetKind } from "./industrialCanvas";
import { t } from "../i18n";
import { ThemeToggle } from "../theme";

interface CanvasNavigationProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenExplorer: () => void;
  onOpenCommand: () => void;
  onAdd: (kind: CanvasWidgetKind) => void;
  onOpenInspector: (tab: "comments" | "properties") => void;
  onHelp: () => void;
  onNotify: (message: string) => void;
}

const navItems = [
  { label: "Home", icon: Home, action: "home" },
  { label: "Search", icon: Search, action: "search" },
  { label: "Data Explorer", icon: Network, action: "explorer" },
  { label: "Canvas", icon: PanelsTopLeft, action: "canvas" },
  { label: "Assets", icon: Box, action: "asset" },
  { label: "Documents", icon: Files, action: "document" },
  { label: "Settings", icon: Settings, action: "settings" },
  { label: "Help", icon: CircleHelp, action: "help" },
] as const;

export function CanvasNavigation({ collapsed, onToggle, onOpenExplorer, onOpenCommand, onAdd, onOpenInspector, onHelp, onNotify }: CanvasNavigationProps) {
  function activate(action: typeof navItems[number]["action"]) {
    if (action === "home" || action === "explorer") onOpenExplorer();
    else if (action === "search") onOpenCommand();
    else if (action === "asset") onAdd("asset");
    else if (action === "document") onAdd("document");
    else if (action === "settings") onOpenInspector("properties");
    else if (action === "help") onHelp();
    else onNotify(t("Canvas is already open"));
  }
  return (
    <aside className={`industrial-nav${collapsed ? " is-collapsed" : ""}`} aria-label={t("Primary navigation")}>
      <div className="industrial-nav-brand"><BrandLogo variant={collapsed ? "icon" : "full"} /></div>
      <nav>{navItems.map(({ label, icon: Icon, action }) => { const title = t(label); return <button key={label} type="button" className={action === "canvas" ? "is-active" : ""} aria-label={action === "explorer" ? t("Data Explorer") : title} aria-current={action === "canvas" ? "page" : undefined} title={collapsed ? title : undefined} onClick={() => activate(action)}><Icon size={20} strokeWidth={1.7} /><span>{title}</span></button>; })}</nav>
      <button className="industrial-nav-collapse" type="button" aria-label={collapsed ? t("Expand sidebar") : t("Collapse sidebar")} aria-expanded={!collapsed} onClick={onToggle}>{collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}<span>{collapsed ? "" : t("Collapse")}</span></button>
    </aside>
  );
}

export function CanvasHeader({ title, saveState, canUndo, canRedo, inspectorOpen, onRename, onUndo, onRedo, onOpenHistory, onOpenComments, onToggleInspector, onOpenCommand, onReset, onNotify, caseKey, onOpenCaseWorkspace, onOpenDemoCanvas }: {
  title: string;
  saveState: "saving" | "saved";
  canUndo: boolean;
  canRedo: boolean;
  inspectorOpen: boolean;
  onRename: (title: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHistory: () => void;
  onOpenComments: () => void;
  onToggleInspector: () => void;
  onOpenCommand: () => void;
  onReset: () => void;
  onNotify: (message: string) => void;
  caseKey?: string | null;
  onOpenCaseWorkspace?: () => void;
  onOpenDemoCanvas?: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event: PointerEvent) => { if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [moreOpen]);
  const shareCanvas = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      onNotify(t("Share link copied for this local canvas"));
    } catch {
      onNotify(t("Copy the address bar URL to share this local canvas"));
    }
  };
  return (
    <header className="industrial-header">
      <div className="industrial-case-switch">
        {caseKey
          ? <button type="button" className="is-active" onClick={() => onOpenDemoCanvas?.()}>{t("Back to demo canvas")}</button>
          : <button type="button" onClick={() => onOpenCaseWorkspace?.()}>{t("Open case workspace")}</button>}
      </div>
      <div className="industrial-breadcrumb"><span>{t("Canvas")}</span><ChevronDown size={13} /><input aria-label={t("Canvas name")} value={title} onChange={(event) => onRename(event.target.value)} onBlur={(event) => { if (!event.target.value.trim()) onRename(t("Untitled canvas")); }} /></div>
      <div className="industrial-header-history"><button type="button" aria-label={t("Undo")} disabled={!canUndo} onClick={onUndo}><Undo2 size={17} /></button><button type="button" aria-label={t("Redo")} disabled={!canRedo} onClick={onRedo}><Redo2 size={17} /></button><span className={`industrial-save-status is-${saveState}`}>{saveState === "saving" ? <LoaderCircle size={14} /> : <Check size={14} />}{saveState === "saving" ? t("Saving…") : t("Saved")}</span><button type="button" aria-label={t("History")} onClick={onOpenHistory}><History size={17} /></button><div className="industrial-more" ref={moreRef}><button type="button" aria-label={t("More canvas actions")} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={18} /></button>{moreOpen ? <div role="menu"><button type="button" role="menuitem" onClick={() => { onOpenCommand(); setMoreOpen(false); }}>{t("Open command palette")} <kbd>Ctrl K</kbd></button><button type="button" role="menuitem" onClick={() => { onNotify(t("Canvas state is stored locally in this browser")); setMoreOpen(false); }}>{t("Storage details")}</button><button type="button" role="menuitem" className="is-danger" onClick={() => { onReset(); setMoreOpen(false); }}>{t("Reset canvas")}</button></div> : null}</div></div>
      <div className="industrial-header-collaboration"><ThemeToggle compact /><div className="industrial-collaborators" aria-label={t("3 collaborators")}><span>YO</span><span>AK</span><span>+1</span></div><button type="button" aria-label={t("Notifications")} onClick={() => onNotify(t("You are all caught up"))}><Bell size={17} /></button><button type="button" aria-label={t("Comments")} onClick={onOpenComments}><MessageSquare size={17} /></button><button type="button" aria-label={t("Share canvas")} onClick={() => { void shareCanvas(); }}><Share2 size={17} /></button><button type="button" aria-label={inspectorOpen ? t("Close inspector") : t("Open inspector")} aria-expanded={inspectorOpen} onClick={onToggleInspector}>{inspectorOpen ? <PanelRight size={17} /> : <PanelLeft size={17} />}</button></div>
    </header>
  );
}

const toolItems: Array<{ label: string; icon: LucideIcon; tool?: CanvasTool; kind?: CanvasWidgetKind }> = [
  { label: "Select", icon: MousePointer2, tool: "select" },
  { label: "Hand / Pan", icon: Hand, tool: "hand" },
  { label: "Add text", icon: Type, kind: "text" },
  { label: "Add note", icon: StickyNote, kind: "note" },
  { label: "Add image", icon: Image, kind: "image" },
  { label: "Add document", icon: FileText, kind: "document" },
  { label: "Add chart", icon: ChartNoAxesCombined, kind: "chart" },
  { label: "Add time series", icon: Clock3, kind: "timeSeries" },
  { label: "Add 3D viewer", icon: Cuboid, kind: "model3d" },
  { label: "Add asset card", icon: Box, kind: "asset" },
  { label: "Add cause map", icon: GitBranch, kind: "causeMap" },
  { label: "Add drawing page", icon: MapIcon, kind: "drawingPage" },
  { label: "Add analysis results", icon: ClipboardList, kind: "resultsTable" },

  { label: "AI question card", icon: Bot, kind: "ai" },
  { label: "Connector", icon: Link2, tool: "connector" },
  { label: "Frame / Section", icon: Frame, kind: "frame" },
  { label: "Comment", icon: MessageSquare, tool: "comment" },
];

export function CanvasToolRail({ activeTool, onTool, onAdd }: { activeTool: CanvasTool; onTool: (tool: CanvasTool) => void; onAdd: (kind: CanvasWidgetKind) => void }) {
  return (
    <div className="industrial-tool-rail" role="toolbar" aria-label={t("Canvas tools")}>
      {toolItems.map(({ label, icon: Icon, tool, kind }, index) => { const title = label === "Connector" ? t("Canvas connector") : t(label); return <button key={label} type="button" className={`${tool && activeTool === tool ? "is-active" : ""}${index === 2 || index === 12 ? " is-separated" : ""}`} aria-label={title} aria-pressed={tool ? activeTool === tool : undefined} title={title} onClick={() => tool ? onTool(tool) : kind ? onAdd(kind) : undefined}><Icon size={17} /></button>; })}
    </div>
  );
}

export function CanvasHistoryPopover({ open, entries, onClose, onRestore }: { open: boolean; entries: Array<{ id: string; label: string; at: string }>; onClose: () => void; onRestore: (index: number) => void }) {
  if (!open) return null;
  return <section className="industrial-history-popover" aria-label={t("Canvas history")}><header><div><strong>{t("History")}</strong><span>{t("Local changes in this session")}</span></div><button type="button" aria-label={t("Close history")} onClick={onClose}><PanelRight size={16} /></button></header>{entries.length ? <ol>{entries.map((entry, index) => <li key={entry.id}><span><Clock3 size={14} /></span><div><strong>{entry.label}</strong><time>{entry.at}</time></div><button type="button" onClick={() => onRestore(index)}>{t("Restore")}</button></li>)}</ol> : <p>{t("No local changes yet.")}</p>}</section>;
}
