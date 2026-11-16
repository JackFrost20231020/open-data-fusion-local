import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCaseAnalysis,
  getCaseInstance,
  getCasePageElements,
  listCasePages,
  type CaseGraphElement,
  type CaseGraphPage,
  type CaseRelationship,
} from "../lib/api";
import type { PlatformContext } from "../types";
import { t } from "../i18n";
import { sanitizeSvg } from "../lib/sanitizeSvg";
import { hitTargetForElement, inflate, intersectsBox, labelWorldBox, matrixTransform, parsePointList, viewBoxString, type WorldBBox } from "./drawingGeometry";
import {
  buildHitModel,
  compactVisibleLabel,
  inspectorTitle,
  placeVisibleLabels,
  resolveDrawingHit,
  selectionAfterPageChange,
  shouldKeepInstanceResult,
  spatialNeighbors,
  type DrawingHitCandidate,
} from "./drawingSelection";
import type { CanvasWidget } from "./industrialCanvas";

interface Peer {
  rel: CaseRelationship;
  other: (CaseGraphElement & { graphName?: string | null }) | null;
  otherName?: string;
  connectPointName?: string | null;
  otherConnectPointName?: string | null;
  crossPage: boolean;
}

interface DrawingPageWidgetProps {
  widget: CanvasWidget;
  platformContext: PlatformContext | null;
  onUpdate: (patch: Partial<CanvasWidget["data"]>) => void;
}

export function DrawingPageWidget({ widget, platformContext, onUpdate }: DrawingPageWidgetProps) {
  const caseKey = widget.data.caseKey ?? "";
  const instrumentTag = widget.data.instrumentTag ?? widget.data.queryInstrument;
  const graphName = widget.data.graphName ?? "";
  const selectedId = widget.data.selectedInstanceId ?? null;
  const presetHighlights = widget.data.highlightIds ?? [];

  const [pages, setPages] = useState<CaseGraphPage[]>([]);
  const [elements, setElements] = useState<CaseGraphElement[]>([]);
  const [extent, setExtent] = useState<WorldBBox | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [view, setView] = useState<WorldBBox | null>(null);
  const [pathIds, setPathIds] = useState<string[]>(presetHighlights);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selected, setSelected] = useState<CaseGraphElement | null>(null);
  const [clickCandidates, setClickCandidates] = useState<DrawingHitCandidate[]>([]);
  const drag = useRef<{ x: number; y: number; view: WorldBBox; moved?: boolean } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const spaceDown = useRef(false);
  const skipClick = useRef(false);
  const instanceRequest = useRef(0);
  const prevCaseKey = useRef(caseKey);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    if (prevCaseKey.current === caseKey) return;
    prevCaseKey.current = caseKey;
    setSelected(null);
    setPeers([]);
    setConnectedIds([]);
    setClickCandidates([]);
    setView(null);
    onUpdate({ selectedInstanceId: undefined });
  }, [caseKey, onUpdate]);

  useEffect(() => {
    if (!platformContext || !caseKey) return;
    const controller = new AbortController();
    void listCasePages(platformContext, caseKey, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setPages(result.pages);
        if (!widget.data.graphName && result.pages[0]?.graphName) {
          onUpdate({ graphName: result.pages[0].graphName });
        }
      })
      .catch(() => undefined);
    if (instrumentTag) {
      void getCaseAnalysis(platformContext, caseKey, instrumentTag, controller.signal)
        .then((analysis) => {
          if (controller.signal.aborted) return;
          const ids = Array.isArray(analysis.pathIds) ? analysis.pathIds.map(String) : [];
          if (ids.length) setPathIds(ids);
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [platformContext, caseKey, instrumentTag]);

  useEffect(() => {
    if (!platformContext || !caseKey || !graphName) {
      if (!caseKey) {
        setElements([]);
        setExtent(null);
        setStatus("ready");
      }
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    setElements([]);
    setExtent(null);
    setError("");
    void getCasePageElements(platformContext, caseKey, graphName, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setElements(result.elements);
        setExtent(result.extent);
        setView(result.extent ? inflate(result.extent, 24) : null);
        setStatus("ready");
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : t("Failed to load drawing"));
      });
    return () => controller.abort();
  }, [platformContext, caseKey, graphName]);

  useEffect(() => {
    if (!platformContext || !selectedId) {
      setSelected(null);
      setPeers([]);
      setConnectedIds([]);
      return;
    }
    const local = elements.find((item) => item.nodeId === selectedId) ?? null;
    if (local) setSelected(local);
    const controller = new AbortController();
    const requestId = ++instanceRequest.current;
    void getCaseInstance(platformContext, caseKey, selectedId, controller.signal)
      .then((result) => {
        if (!shouldKeepInstanceResult({
          requestId,
          currentRequestId: instanceRequest.current,
          aborted: controller.signal.aborted,
          instanceId: result.instance.nodeId,
          expectedId: selectedId,
          instancePage: result.instance.graphName,
          currentPage: graphName,
        })) return;
        setSelected(result.instance);
        const nextPeers = ((result as { peers?: Peer[] }).peers ?? []).filter((peer) => peer.rel.relType === "CONNECTS" || peer.rel.relType === "BELONG");
        setPeers(nextPeers.filter((peer) => peer.rel.relType === "CONNECTS"));
        setConnectedIds(nextPeers.filter((peer) => peer.rel.relType === "CONNECTS").map((peer) => (peer.other?.nodeId ?? (peer.rel.startId === selectedId ? peer.rel.endId : peer.rel.startId))));
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [platformContext, caseKey, selectedId, elements, graphName]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!selectedId) return;
    if (elements.some((item) => item.nodeId === selectedId)) return;
    setSelected(null);
    setPeers([]);
    setConnectedIds([]);
    setClickCandidates([]);
    onUpdate({ selectedInstanceId: undefined });
  }, [status, elements, selectedId, onUpdate]);

  const highlightSet = useMemo(() => new Set(pathIds), [pathIds]);
  const connectedSet = useMemo(() => new Set(connectedIds), [connectedIds]);

  const visible = useMemo(() => {
    if (!view) return elements;
    const windowBox = inflate(view, 40);
    return elements.filter((item) => !item.worldBBox || intersectsBox(item.worldBBox, windowBox));
  }, [elements, view]);

  const labels = useMemo(() => placeVisibleLabels(visible.map((item) => ({
    ...item,
    priority: (item.nodeId === selectedId ? 100 : 0)
      + (highlightSet.has(item.nodeId) ? 40 : 0)
      + (item.shortCode ? 30 : 10),
  })), view), [visible, view, selectedId, highlightSet]);

  const hitModel = useMemo(() => buildHitModel(elements, labels), [elements, labels]);
  const nearbyIds = useMemo(() => (selectedId ? spatialNeighbors(selectedId, hitModel) : []), [selectedId, hitModel]);
  const nearbySet = useMemo(() => new Set(nearbyIds), [nearbyIds]);
  const selectedOnPage = Boolean(selected && elements.some((item) => item.nodeId === selected.nodeId));

  const lookup = (nodeId: string) => elements.find((item) => item.nodeId === nodeId) ?? (selected?.nodeId === nodeId ? selected : null);

  const fit = useCallback(() => {
    if (extent) setView(inflate(extent, 24));
  }, [extent]);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!view) return;
      const rect = node.getBoundingClientRect();
      const width = Math.max(1, view.maxX - view.minX);
      const height = Math.max(1, view.maxY - view.minY);
      const origin = {
        x: view.minX + ((event.clientX - rect.left) / Math.max(1, rect.width)) * width,
        y: view.minY + ((event.clientY - rect.top) / Math.max(1, rect.height)) * height,
      };
      const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
      const nextWidth = width * factor;
      const nextHeight = height * factor;
      const rx = (origin.x - view.minX) / width;
      const ry = (origin.y - view.minY) / height;
      setView({
        minX: origin.x - nextWidth * rx,
        minY: origin.y - nextHeight * ry,
        maxX: origin.x + nextWidth * (1 - rx),
        maxY: origin.y + nextHeight * (1 - ry),
      });
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat) {
        const typing = event.target instanceof HTMLElement && event.target.matches("input, textarea, select, [contenteditable='true']");
        if (typing) return;
        spaceDown.current = true;
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  function clientToWorld(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    if (!frame.current || !view) return null;
    const rect = frame.current.getBoundingClientRect();
    const width = Math.max(1, view.maxX - view.minX);
    const height = Math.max(1, view.maxY - view.minY);
    return {
      x: view.minX + ((event.clientX - rect.left) / Math.max(1, rect.width)) * width,
      y: view.minY + ((event.clientY - rect.top) / Math.max(1, rect.height)) * height,
    };
  }

  function zoomFactor(factor: number, origin?: { x: number; y: number }) {
    if (!view) return;
    const point = origin ?? { x: (view.minX + view.maxX) / 2, y: (view.minY + view.maxY) / 2 };
    const width = (view.maxX - view.minX) * factor;
    const height = (view.maxY - view.minY) * factor;
    const rx = (point.x - view.minX) / Math.max(1, view.maxX - view.minX);
    const ry = (point.y - view.minY) / Math.max(1, view.maxY - view.minY);
    setView({
      minX: point.x - width * rx,
      minY: point.y - height * ry,
      maxX: point.x + width * (1 - rx),
      maxY: point.y + height * (1 - ry),
    });
  }

  function onPointerDown(event: React.PointerEvent) {
    event.stopPropagation();
    if (!view) return;
    const pan = event.button === 1 || (event.button === 0 && spaceDown.current);
    const target = event.target as Element;
    if (!pan && event.button === 0 && target.closest("[data-node-id]") && !event.shiftKey && !event.altKey) return;
    if (!pan && event.button !== 0) return;
    event.preventDefault();
    drag.current = { x: event.clientX, y: event.clientY, view, moved: false };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag.current || !frame.current) return;
    if (Math.abs(event.clientX - drag.current.x) > 3 || Math.abs(event.clientY - drag.current.y) > 3) {
      drag.current.moved = true;
    }
    const rect = frame.current.getBoundingClientRect();
    const origin = drag.current.view;
    const dx = ((event.clientX - drag.current.x) / Math.max(1, rect.width)) * (origin.maxX - origin.minX);
    const dy = ((event.clientY - drag.current.y) / Math.max(1, rect.height)) * (origin.maxY - origin.minY);
    setView({
      minX: origin.minX - dx,
      minY: origin.minY - dy,
      maxX: origin.maxX - dx,
      maxY: origin.maxY - dy,
    });
  }

  function onPointerUp() {
    if (drag.current?.moved) skipClick.current = true;
    drag.current = null;
    setPanning(false);
  }

  function selectNode(nodeId: string, candidates: DrawingHitCandidate[] = []) {
    setClickCandidates(candidates.filter((item) => item.nodeId !== nodeId));
    onUpdate({ selectedInstanceId: nodeId });
  }

  function goTo(pageName: string, nodeId?: string) {
    const keep = selectionAfterPageChange(nodeId);
    setClickCandidates([]);
    if (!keep) {
      setSelected(null);
      setPeers([]);
      setConnectedIds([]);
    }
    onUpdate({ graphName: pageName, selectedInstanceId: keep });
    setView(null);
  }

  function onStageClick(event: React.MouseEvent) {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    if (event.button !== 0 || spaceDown.current) return;
    const point = clientToWorld(event);
    if (!point) return;
    const resolution = resolveDrawingHit(point, hitModel);
    if (!resolution.primaryId) return;
    selectNode(resolution.primaryId, resolution.candidates);
  }

  const clickCandidateIds = new Set(clickCandidates.map((item) => item.nodeId));
  const nearbyOnly = nearbyIds.filter((id) => !clickCandidateIds.has(id));

  return (
    <div className="industrial-drawing-widget">
      <div className="industrial-drawing-toolbar">
        <label>
          {t("Drawing page")}
          <select value={graphName} onChange={(event) => goTo(event.target.value)} aria-label={t("Drawing page")}>
            {(pages.length ? pages : [{ graphName, instanceCount: elements.length, nodeId: "", graphId: "" }]).map((page) => (
              <option key={page.graphName} value={page.graphName}>
                {page.graphName}（{page.instanceCount}）
              </option>
            ))}
          </select>
        </label>
        <div className="industrial-drawing-zoom">
          <button type="button" onClick={() => zoomFactor(1 / 1.25)}>{t("Zoom in")}</button>
          <button type="button" onClick={() => zoomFactor(1.25)}>{t("Zoom out")}</button>
          <button type="button" onClick={fit}>{t("Fit page")}</button>
        </div>
        <span className="industrial-drawing-meta">
          {status === "loading" ? t("Loading drawing…") : t("{visible} of {total} elements", { visible: visible.filter((item) => hitTargetForElement(item)).length, total: elements.length })}
        </span>
      </div>
      {status === "error" ? <p className="industrial-drawing-error">{error}</p> : null}
      <div
        className={`industrial-drawing-stage${panning ? " is-panning" : ""}`}
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onStageClick}
      >
        {view ? (
          <svg viewBox={viewBoxString(view)} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={graphName}>
            <rect x={view.minX} y={view.minY} width={view.maxX - view.minX} height={view.maxY - view.minY} fill="var(--odf-surface, #fff)" />
            {visible.map((item) => {
              const isSelected = item.nodeId === selectedId;
              const isPath = highlightSet.has(item.nodeId);
              const isNeighbor = connectedSet.has(item.nodeId);
              const isNearby = nearbySet.has(item.nodeId);
              const className = `drawing-node drawing-graphics${isSelected ? " is-selected" : ""}${isPath ? " is-path" : ""}${isNeighbor ? " is-neighbor" : ""}${isNearby ? " is-nearby" : ""}`;
              const transform = matrixTransform(item.matrix);
              if (item.drawingMethod === "PIPE_SEGMENT") {
                const pts = parsePointList(item.points);
                if (pts.length < 2) return null;
                return (
                  <polyline
                    key={item.nodeId}
                    className={className}
                    fill="none"
                    points={pts.map((point) => `${point.x},${point.y}`).join(" ")}
                  />
                );
              }
              if (item.objSvg) {
                return (
                  <g
                    key={item.nodeId}
                    className={className}
                    transform={transform}
                    dangerouslySetInnerHTML={{ __html: sanitizeSvg(item.objSvg) }}
                  />
                );
              }
              if (!item.worldBBox) return null;
              const box = item.worldBBox;
              return (
                <rect
                  key={item.nodeId}
                  className={`${className} is-fallback`}
                  x={box.minX}
                  y={box.minY}
                  width={Math.max(1, box.maxX - box.minX)}
                  height={Math.max(1, box.maxY - box.minY)}
                />
              );
            })}
            {visible.map((item) => {
              const hit = hitTargetForElement(item);
              if (!hit || hit.kind !== "box" || !hit.box) return null;
              return (
                <rect
                  key={`hit-${item.nodeId}`}
                  data-node-id={item.nodeId}
                  className="drawing-hit"
                  x={hit.box.minX}
                  y={hit.box.minY}
                  width={Math.max(1, hit.box.maxX - hit.box.minX)}
                  height={Math.max(1, hit.box.maxY - hit.box.minY)}
                />
              );
            })}
            {visible.map((item) => {
              const hit = hitTargetForElement(item);
              if (!hit || hit.kind !== "polyline" || !hit.points) return null;
              return (
                <polyline
                  key={`hit-${item.nodeId}`}
                  data-node-id={item.nodeId}
                  className="drawing-hit drawing-hit-pipe"
                  fill="none"
                  points={hit.points.map((point) => `${point.x},${point.y}`).join(" ")}
                />
              );
            })}
            {labels.map((label) => {
              const box = labelWorldBox(label);
              return (
                <g key={`label-${label.id}`} data-node-id={label.id} className="drawing-label-group">
                  <rect
                    className="drawing-hit drawing-hit-label"
                    x={box.minX}
                    y={box.minY}
                    width={Math.max(1, box.maxX - box.minX)}
                    height={Math.max(1, box.maxY - box.minY)}
                  />
                  <text
                    className="drawing-label"
                    x={label.x}
                    y={label.y}
                    fontSize={9}
                    textAnchor={label.anchor ?? "start"}
                    dominantBaseline={label.baseline === "middle" ? "middle" : "alphabetic"}
                    pointerEvents="none"
                  >{label.text}</text>
                </g>
              );
            })}
            {selectedOnPage && selected?.worldBBox ? (
              <rect
                className="drawing-selection-box"
                x={selected.worldBBox.minX - 2}
                y={selected.worldBBox.minY - 2}
                width={Math.max(1, selected.worldBBox.maxX - selected.worldBBox.minX) + 4}
                height={Math.max(1, selected.worldBBox.maxY - selected.worldBBox.minY) + 4}
                fill="none"
                pointerEvents="none"
              />
            ) : null}
          </svg>
        ) : (
          <p className="industrial-drawing-empty">{!caseKey ? t("No case loaded. Import a local package and open ?case=your-case-key.") : platformContext ? t("Loading drawing…") : t("Waiting for project context")}</p>
        )}
      </div>
      <aside className="industrial-drawing-inspector">
        {selected && (selectedOnPage || status !== "ready") ? (
          <>
            <header>
              <span className="drawing-inspector-kicker">{t("Selected object")}</span>
              <strong>{inspectorTitle(selected)}</strong>
              <span>{selected.componentName || selected.drawingMethod || selected.nodeId}</span>
            </header>
            <dl>
              <div><dt>{t("Node ID")}</dt><dd>{selected.nodeId}</dd></div>
              {selected.deviceName ? <div><dt>{t("Device name")}</dt><dd>{selected.deviceName}</dd></div> : null}
              {selected.equipCode ? <div><dt>{t("Equipment code")}</dt><dd>{selected.equipCode}</dd></div> : null}
              {selected.shortCode ? <div><dt>{t("Short code")}</dt><dd>{selected.shortCode}</dd></div> : null}
              {selected.graphName ? <div><dt>{t("Page")}</dt><dd>{selected.graphName}</dd></div> : null}
              {selected.drawingMethod ? <div><dt>{t("Drawing method")}</dt><dd>{selected.drawingMethod}</dd></div> : null}
              {selected.matrix ? <div><dt>matrix</dt><dd>{selected.matrix}</dd></div> : null}
            </dl>
            {clickCandidates.length ? (
              <>
                <h4>{t("Other objects at this click")}</h4>
                <ul>
                  {clickCandidates.map((candidate) => {
                    const item = lookup(candidate.nodeId);
                    const title = item ? inspectorTitle(item) : candidate.nodeId;
                    return (
                      <li key={`click-${candidate.nodeId}`}>
                        <button type="button" onClick={() => selectNode(candidate.nodeId)}>
                          {title}
                          <span>{t("At this click")} · {item?.componentName || candidate.reason} · {candidate.nodeId}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
            {nearbyOnly.length ? (
              <>
                <h4>{t("Nearby objects")}</h4>
                <p className="drawing-inspector-note">{t("Spatially adjacent on this page; not a graph relationship.")}</p>
                <ul>
                  {nearbyOnly.map((nodeId) => {
                    const item = lookup(nodeId);
                    const title = item ? inspectorTitle(item) : nodeId;
                    return (
                      <li key={`near-${nodeId}`}>
                        <button type="button" onClick={() => selectNode(nodeId)}>
                          {title}
                          <span>{item?.componentName || (item ? compactVisibleLabel(item) : nodeId)} · {nodeId}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
            <h4>{t("Connections")}</h4>
            {peers.length ? (
              <ul>
                {peers.map((peer) => {
                  const otherId = peer.other?.nodeId ?? (peer.rel.startId === selected.nodeId ? peer.rel.endId : peer.rel.startId);
                  const title = peer.otherName || (peer.other ? inspectorTitle(peer.other) : otherId);
                  const points = [peer.connectPointName, peer.otherConnectPointName].filter(Boolean).join(" → ");
                  return (
                    <li key={peer.rel.relId}>
                      <button type="button" onClick={() => {
                        if (peer.crossPage && peer.other?.graphName) goTo(peer.other.graphName, otherId);
                        else selectNode(otherId);
                      }}>
                        {title}
                        <span>
                          {points ? `${points} · ` : ""}
                          {peer.rel.connectType || peer.rel.relType}
                          {peer.crossPage ? ` · ${t("Cross-page")} ${peer.other?.graphName ?? ""}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p>{t("No CONNECTS relationships")}</p>}
          </>
        ) : (
          <p>{t("Click a symbol or pipe to inspect its properties and connections.")}</p>
        )}
      </aside>
    </div>
  );
}
