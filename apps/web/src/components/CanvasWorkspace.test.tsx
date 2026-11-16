import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_STORAGE_KEY, createEmptyCanvas, createWidget, saveCanvas } from "./industrialCanvas";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { t } from "../i18n";

function widgetLabel(title: string, kind: string, breach?: "latest" | "window") {
  const key = breach === "latest"
    ? "{title} {kind} widget, latest value is breaching a threshold"
    : breach === "window"
      ? "{title} {kind} widget, threshold breach in this window"
      : "{title} {kind} widget";
  return t(key, { title: t(title), kind: t(kind) });
}

function toolName(name: string) {
  return name === "Connector" ? t("Canvas connector") : t(name);
}


function renderCanvas() {
  const onNotify = vi.fn();
  const onOpenExplorer = vi.fn();
  render(
    <CanvasWorkspace
      snapshot={null}
      workspace={null}
      platformContext={null}
      onWorkspaceUpdated={vi.fn()}
      onOpenExplorer={onOpenExplorer}
      onNotify={onNotify}
    />,
  );
  return { onNotify, onOpenExplorer };
}

describe("Industrial Data Canvas", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty with the complete navigation and authoring toolbar", () => {
    renderCanvas();

    expect(screen.getByRole("heading", { name: t("Add your first widget") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("Canvas") })).toHaveAttribute("aria-current", "page");
    const toolbar = screen.getByRole("toolbar", { name: t("Canvas tools") });
    for (const name of ["Select", "Hand / Pan", "Add text", "Add note", "Add image", "Add document", "Add chart", "Add time series", "Add 3D viewer", "Add asset card", "Add cause map", "AI question card", "Connector", "Frame / Section", "Comment"]) {
      expect(within(toolbar).getByRole("button", { name: toolName(name) })).toBeInTheDocument();
    }
  });

  it("adds and edits a widget, then persists it locally", async () => {
    renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: t("Add note") }));

    expect(screen.getByLabelText(widgetLabel("Note", "note"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("Open inspector") }));
    const inspector = screen.getByRole("complementary", { name: t("Canvas inspector") });
    fireEvent.change(within(inspector).getByLabelText(t("Name")), { target: { value: "Shift context" } });

    expect(screen.getByLabelText(t("{title} {kind} widget", { title: "Shift context", kind: t("note") }))).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(CANVAS_STORAGE_KEY)).toContain('"title":"Shift context"'), { timeout: 1500 });
  });

  it("does not intercept spaces or line breaks typed inside text widgets", () => {
    renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: t("Add text") }));
    const editor = within(screen.getByLabelText(widgetLabel("Text", "text"))).getByRole("textbox");

    expect(editor).toHaveValue("");
    expect(editor).toHaveAttribute("placeholder", t("Add text"));
    expect(fireEvent.keyDown(editor, { key: " " })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: "Enter" })).toBe(true);
    fireEvent.change(editor, { target: { value: "Xin chào\nca trực" } });
    expect(editor).toHaveValue("Xin chào\nca trực");
  });

  it("treats the old default text as a placeholder for saved widgets", () => {
    const canvas = createEmptyCanvas();
    const text = createWidget("text", { x: 80, y: 80 }, 1);
    text.data.text = "Add text";
    canvas.widgets = [text];
    saveCanvas(canvas);
    renderCanvas();

    const editor = within(screen.getByLabelText(widgetLabel("Text", "text"))).getByRole("textbox");
    expect(editor).toHaveValue("");
    expect(editor).toHaveAttribute("placeholder", t("Add text"));
  });

  it("wires every toolbar content control to an editable or actionable widget", async () => {
    const { onOpenExplorer } = renderCanvas();
    const toolbar = screen.getByRole("toolbar", { name: t("Canvas tools") });
    const stage = screen.getByRole("main", { name: t("Open Data Fusion industrial canvas") });
    const setPointerCapture = vi.fn();
    Object.defineProperty(stage, "setPointerCapture", { configurable: true, value: setPointerCapture });

    fireEvent.click(within(toolbar).getByRole("button", { name: t("Hand / Pan") }));
    expect(stage).toHaveClass("tool-hand");
    const select = within(toolbar).getByRole("button", { name: t("Select") });
    fireEvent.pointerDown(select, { button: 0, pointerId: 7 });
    expect(setPointerCapture).not.toHaveBeenCalled();
    fireEvent.click(select);
    expect(stage).toHaveClass("tool-select");

    for (const name of ["Add text", "Add note", "Add image", "Add document", "Add chart", "Add time series", "Add 3D viewer", "Add asset card", "Add cause map", "AI question card", "Frame / Section"]) {
      fireEvent.click(within(toolbar).getByRole("button", { name: toolName(name) }));
    }

    const text = screen.getByLabelText(widgetLabel("Text", "text"));
    const note = screen.getByLabelText(widgetLabel("Note", "note"));
    const image = screen.getByLabelText(widgetLabel("Image", "image"));
    const document = screen.getByLabelText(widgetLabel("Document", "document"));
    const chart = screen.getByLabelText(widgetLabel("Chart", "chart"));
    const timeSeries = screen.getByLabelText(widgetLabel("Time series", "timeSeries"));
    const model = screen.getByLabelText(widgetLabel("3D viewer", "model3d"));
    const asset = screen.getByLabelText(widgetLabel("Asset", "asset"));
    const ai = screen.getByLabelText(widgetLabel("Ask the canvas", "ai"));
    const causeMap = screen.getByLabelText(widgetLabel("Cause map", "causeMap"));
    const frame = screen.getByLabelText(widgetLabel("Section", "frame"));
    expect(within(causeMap).getByRole("textbox", { name: t("Root cause label") })).toHaveValue(t("What happened?"));
    fireEvent.change(within(causeMap).getByRole("textbox", { name: t("Root cause label") }), { target: { value: "P-101 trip" } });
    expect(within(causeMap).getByRole("textbox", { name: t("Root cause label") })).toHaveValue("P-101 trip");

    fireEvent.change(within(text).getByRole("textbox"), { target: { value: "Operating envelope" } });
    fireEvent.change(within(note).getByRole("textbox"), { target: { value: "Inspect on next shift" } });
    expect(within(text).getByDisplayValue("Operating envelope")).toBeInTheDocument();
    expect(within(note).getByDisplayValue("Inspect on next shift")).toBeInTheDocument();

    const imageInput = image.querySelector<HTMLInputElement>('input[type="file"]');
    const documentInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(imageInput).not.toBeNull();
    expect(documentInput).not.toBeNull();
    fireEvent.change(imageInput!, { target: { files: [new File(["image"], "inspection.png", { type: "image/png" })] } });
    fireEvent.change(documentInput!, { target: { files: [new File(["pdf"], "procedure.pdf", { type: "application/pdf" })] } });
    expect(await within(image).findByAltText("inspection.png")).toBeInTheDocument();
    expect(await within(document).findByLabelText("procedure.pdf")).toBeInTheDocument();

    for (const [widget, action] of [[chart, t("Select data source")], [timeSeries, t("Select data source")], [model, t("Select model source")], [asset, t("Connect data source")], [ai, t("Connect data source")]] as const) {
      fireEvent.click(within(widget).getByRole("button", { name: action }));
    }
    expect(onOpenExplorer).toHaveBeenCalledTimes(5);
    expect(within(frame).getByText(t("Drop related widgets inside this section"))).toBeInTheDocument();
    expect(Number(frame.style.zIndex)).toBeLessThan(Number(note.style.zIndex));

    const notePosition = note.style.transform;
    const frameHeader = frame.querySelector("header");
    expect(frameHeader).not.toBeNull();
    fireEvent.pointerDown(frameHeader!, { button: 0, pointerId: 12, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 12, clientX: 140, clientY: 140 });
    fireEvent.pointerUp(stage, { pointerId: 12, clientX: 140, clientY: 140 });
    expect(note.style.transform).not.toBe(notePosition);
  });

  it("creates a connector between two widgets and removes it with Delete", () => {
    renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: t("Add note") }));
    fireEvent.click(screen.getByRole("button", { name: /添加资产卡片/ }));
    const note = screen.getByLabelText(widgetLabel("Note", "note"));
    const asset = screen.getByLabelText(widgetLabel("Asset", "asset"));

    fireEvent.click(screen.getByRole("button", { name: t("Canvas connector") }));
    fireEvent.click(note);
    fireEvent.click(asset);

    const connector = screen.getByRole("button", { name: t("Connector from {source} to {target}", { source: t("Note"), target: t("Asset") }) });
    fireEvent.click(connector);
    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.queryByRole("button", { name: t("Connector from {source} to {target}", { source: t("Note"), target: t("Asset") }) })).not.toBeInTheDocument();
  });

  it("applies the connected 3D viewer controls to local viewer state", () => {
    const canvas = createEmptyCanvas();
    const model = createWidget("model3d", { x: 80, y: 80 }, 1);
    model.data = { ...model.data, connected: true, sourceLabel: "Model source" };
    canvas.widgets = [model];
    saveCanvas(canvas);
    renderCanvas();

    const viewer = screen.getByLabelText(widgetLabel("3D viewer", "model3d"));
    const pan = within(viewer).getByRole("button", { name: t("Pan") });
    fireEvent.click(pan);
    expect(pan).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(viewer).getByRole("button", { name: t("Zoom model in") }));
    expect(viewer.querySelector(".industrial-model-surface > div")).toHaveStyle({ transform: "scale(1.15)" });
  });

  it("places a comment pin and opens a working thread panel", () => {
    renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: t("Comment") }));
    const stage = screen.getByRole("main", { name: t("Open Data Fusion industrial canvas") });
    fireEvent.pointerDown(stage, { button: 0, pointerId: 5, clientX: 420, clientY: 260 });

    const pin = screen.getByRole("button", { name: t("Comment {index}: {body}", { index: 1, body: t("New comment") }) });
    expect(pin).toBeInTheDocument();
    const inspector = screen.getByRole("complementary", { name: t("Canvas inspector") });
    expect(within(inspector).getByRole("tab", { name: /评论/ })).toHaveAttribute("aria-selected", "true");
    expect(within(inspector).getByText(t("New comment"))).toBeInTheDocument();

    fireEvent.click(within(inspector).getByRole("button", { name: t("Close inspector") }));
    const initialPosition = pin.style.transform;
    fireEvent.pointerDown(pin, { button: 0, pointerId: 6, clientX: 420, clientY: 260 });
    fireEvent.pointerMove(stage, { pointerId: 6, clientX: 500, clientY: 320 });
    fireEvent.pointerUp(stage, { pointerId: 6, clientX: 500, clientY: 320 });
    fireEvent.click(pin);
    expect(pin.style.transform).not.toBe(initialPosition);
    expect(screen.getByRole("button", { name: t("Open inspector") })).toBeInTheDocument();
  });

  it("opens the command palette and confirms a full reset", () => {
    renderCanvas();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.click(screen.getByRole("option", { name: /添加资产卡片/ }));
    expect(screen.getByLabelText(widgetLabel("Asset", "asset"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("More canvas actions") }));
    fireEvent.click(screen.getByRole("menuitem", { name: t("Reset canvas") }));
    expect(screen.getByRole("dialog", { name: t("Reset this canvas?") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("Reset canvas") }));
    expect(screen.getByRole("heading", { name: t("Add your first widget") })).toBeInTheDocument();
  });

  it("connects a chart widget to live project telemetry without visiting Explorer", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://test.local");
      if (url.pathname === "/api/v1/assets" && !url.pathname.includes("/P-")) {
        return new Response(JSON.stringify({
          items: [{ externalId: "P-101", name: t("Pump P-101"), description: "Primary pump", type: "Pump", parentExternalId: "AREA-A", metadata: {}, sourceSystem: "demo-seed", createdAt: "2026-11-12T00:00:00.000Z", updatedAt: "2026-11-12T00:00:00.000Z" }],
          total: 1,
          limit: 100,
          offset: 0,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/v1/assets/P-101" && !url.pathname.endsWith("/telemetry") && !url.pathname.includes("telemetry")) {
        return new Response(JSON.stringify({
          asset: { externalId: "P-101", name: t("Pump P-101"), description: "Primary pump", type: "Pump", parentExternalId: "AREA-A", metadata: {}, sourceSystem: "demo-seed", createdAt: "2026-11-12T00:00:00.000Z", updatedAt: "2026-11-12T00:00:00.000Z" },
          parent: null,
          children: [],
          timeSeries: [
            { externalId: "P-101-PRESSURE", assetExternalId: "P-101", name: t("P-101 discharge pressure"), unit: "psi", description: "Discharge pressure", sourceSystem: "demo-seed" },
            { externalId: "P-101-TEMP", assetExternalId: "P-101", name: t("P-101 bearing temperature"), unit: "°C", description: "Bearing temperature", sourceSystem: "demo-seed" },
          ],
          documents: [],
          relations: [],
          provenance: [],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname.startsWith("/api/v1/assets/P-101/telemetry")) {
        expect(url.searchParams.get("from")).toBeTruthy();
        expect(url.searchParams.get("to")).toBeTruthy();
        expect(url.searchParams.get("timeSeriesExternalId")).toBe("P-101-PRESSURE");
        const points = [
          { timestamp: "2026-11-12T10:00:00.000Z", value: 106.5, quality: "good" },
          { timestamp: "2026-11-12T11:00:00.000Z", value: 116.8, quality: "good" },
          { timestamp: "2026-11-12T12:00:00.000Z", value: 111.2, quality: "good" },
        ];
        const buckets = points.map((point) => ({ timestamp: point.timestamp, endTimestamp: point.timestamp, value: point.value, min: point.value - 0.8, max: point.value + 0.8, avg: point.value, count: 4, quality: "good" }));
        return new Response(JSON.stringify({
          assetExternalId: "P-101",
          range: { from: url.searchParams.get("from"), to: url.searchParams.get("to") },
          bucketMs: url.pathname.includes("aggregate") ? Number(url.searchParams.get("bucketMs") ?? 900000) : null,
          series: [{
            externalId: "P-101-PRESSURE",
            assetExternalId: "P-101",
            name: t("P-101 discharge pressure"),
            unit: "psi",
            description: "Discharge pressure",
            sourceSystem: "demo-seed",
            points,
            buckets,
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/v1/events") {
        return new Response(JSON.stringify({ items: [], total: 0, limit: 200, offset: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url.pathname}` } }), { status: 404, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onOpenExplorer = vi.fn();
    render(
      <CanvasWorkspace
        snapshot={null}
        workspace={null}
        platformContext={{ tenantId: "demo", projectId: "north-plant" }}
        onWorkspaceUpdated={vi.fn()}
        onOpenExplorer={onOpenExplorer}
        onNotify={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: t("Add chart") }));
    fireEvent.click(within(screen.getByLabelText(widgetLabel("Chart", "chart"))).getByRole("button", { name: t("Select data source") }));
    expect(onOpenExplorer).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: t("Select data source") });
    const pressure = await within(dialog).findByRole("checkbox", { name: /P-101 排放压力|P-101 discharge pressure/ });
    fireEvent.click(pressure);
    fireEvent.click(within(dialog).getByRole("button", { name: t("Connect") }));

    const chart = await screen.findByRole("img", { name: /chart with 1 visible series|1 条可见序列/i });
    expect(chart).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /P-101 排放压力|P-101 discharge pressure/ })).toBeInTheDocument();
    expect(onOpenExplorer).not.toHaveBeenCalled();
    await waitFor(() => expect(localStorage.getItem(CANVAS_STORAGE_KEY)).toContain("P-101-PRESSURE"));
    const telemetryCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/telemetry"));
    expect(telemetryCalls.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("adds a cause map, grows a child tree, and persists horizontal or vertical layout", async () => {
    renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: t("Add cause map") }));
    const map = screen.getByLabelText(widgetLabel("Cause map", "causeMap"));
    const root = within(map).getByRole("textbox", { name: t("Root cause label") });
    fireEvent.change(root, { target: { value: "P-101 discharge pressure excursion" } });
    fireEvent.click(within(map).getByRole("button", { name: t("Add cause under {label}", { label: "P-101 discharge pressure excursion" }) }));
    expect(within(map).getByRole("textbox", { name: t("Cause label") })).toHaveValue("New cause");
    fireEvent.change(within(map).getByRole("textbox", { name: t("Cause label") }), { target: { value: "CV-101 stuck" } });
    fireEvent.click(within(map).getByRole("button", { name: t("Vertical") }));
    expect(within(map).getByRole("button", { name: t("Vertical") })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(localStorage.getItem(CANVAS_STORAGE_KEY)).toContain("CV-101 stuck"));
    expect(localStorage.getItem(CANVAS_STORAGE_KEY)).toContain('"causeLayout":"vertical"');
  });
  it("sets threshold rules on a live chart, highlights breaches, and persists them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T16:00:00.000Z"));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://test.local");
      if (url.pathname === "/api/v1/assets" && !url.pathname.includes("/P-")) {
        return new Response(JSON.stringify({
          items: [{ externalId: "P-101", name: t("Pump P-101"), description: "Primary pump", type: "Pump", parentExternalId: "AREA-A", metadata: {}, sourceSystem: "demo-seed", createdAt: "2026-11-12T00:00:00.000Z", updatedAt: "2026-11-12T00:00:00.000Z" }],
          total: 1, limit: 100, offset: 0,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/v1/assets/P-101" && !url.pathname.endsWith("/telemetry") && !url.pathname.includes("telemetry")) {
        return new Response(JSON.stringify({
          asset: { externalId: "P-101", name: t("Pump P-101"), description: "Primary pump", type: "Pump", parentExternalId: "AREA-A", metadata: {}, sourceSystem: "demo-seed", createdAt: "2026-11-12T00:00:00.000Z", updatedAt: "2026-11-12T00:00:00.000Z" },
          parent: null, children: [],
          timeSeries: [
            { externalId: "P-101-PRESSURE", assetExternalId: "P-101", name: t("P-101 discharge pressure"), unit: "psi", description: "Discharge pressure", sourceSystem: "demo-seed" },
          ],
          documents: [], relations: [], provenance: [],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname.startsWith("/api/v1/assets/P-101/telemetry")) {
        const points = [
          { timestamp: "2026-11-12T08:00:00.000Z", value: 109.4, quality: "good" },
          { timestamp: "2026-11-12T10:00:00.000Z", value: 96.0, quality: "good" },
          { timestamp: "2026-11-12T12:00:00.000Z", value: 112.2, quality: "good" },
          { timestamp: "2026-11-12T14:00:00.000Z", value: 116.9, quality: "good" },
        ];
        const buckets = points.map((point) => ({ timestamp: point.timestamp, endTimestamp: point.timestamp, value: point.value, min: point.value - 1, max: point.value + 1, avg: point.value, count: 4, quality: "good" }));
        return new Response(JSON.stringify({
          assetExternalId: "P-101",
          range: { from: url.searchParams.get("from"), to: url.searchParams.get("to") },
          bucketMs: url.pathname.includes("aggregate") ? Number(url.searchParams.get("bucketMs") ?? 900000) : null,
          series: [{
            externalId: "P-101-PRESSURE",
            assetExternalId: "P-101",
            name: t("P-101 discharge pressure"),
            unit: "psi",
            description: "Discharge pressure",
            sourceSystem: "demo-seed",
            points,
            buckets,
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/v1/events") {
        return new Response(JSON.stringify({
          items: [{
            externalId: "EVT-P101-HI-2",
            type: "alarm",
            subtype: "threshold_high",
            description: "P-101 排放压力再次越限",
            startTime: "2026-11-12T13:30:00.000Z",
            endTime: "2026-11-12T15:15:00.000Z",
            assetExternalIds: ["P-101"],
            metadata: { status: "active" },
          }],
          total: 1, limit: 200, offset: 0,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url.pathname}` } }), { status: 404, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CanvasWorkspace
        snapshot={null}
        workspace={null}
        platformContext={{ tenantId: "demo", projectId: "north-plant" }}
        onWorkspaceUpdated={vi.fn()}
        onOpenExplorer={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: t("Add chart") }));
    fireEvent.click(within(screen.getByLabelText(widgetLabel("Chart", "chart"))).getByRole("button", { name: t("Select data source") }));
    const dialog = await screen.findByRole("dialog", { name: t("Select data source") });
    fireEvent.click(await within(dialog).findByRole("checkbox", { name: /P-101 排放压力|P-101 discharge pressure/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: t("Connect") }));
    expect(await screen.findByRole("img", { name: /chart with 1 visible series|1 条可见序列/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("Open inspector") }));
    fireEvent.click(screen.getByRole("tab", { name: t("Properties") }));
    const editor = screen.getByRole("region", { name: t("Threshold rules") });
    fireEvent.click(within(editor).getByRole("button", { name: t("Add high") }));
    fireEvent.click(within(editor).getByRole("button", { name: t("Add low") }));
    fireEvent.change(within(editor).getByRole("spinbutton", { name: t("high threshold value") }), { target: { value: "115" } });
    fireEvent.change(within(editor).getByRole("spinbutton", { name: t("low threshold value") }), { target: { value: "100" } });

    const chart = await screen.findByRole("img", { name: /threshold breaches visible|越限已显示/i });
    expect(within(chart).getAllByTestId("threshold-line")).toHaveLength(2);
    expect(within(chart).getAllByTestId("threshold-breach-point").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("threshold-breach-badge")).toHaveTextContent(t("Latest breach"));
    expect(screen.getAllByTestId("chart-agg-band").length).toBeGreaterThan(0);
    expect(screen.getByTestId("chart-event-marker")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/越限/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${t("High")} 115 psi`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${t("Low")} 100 psi`).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "放大时间范围" }));
    await waitFor(() => expect(localStorage.getItem(CANVAS_STORAGE_KEY)).toContain("zoomWindow"));
    fireEvent.click(screen.getByRole("button", { name: "复位时间范围" }));
    await waitFor(() => expect(screen.getByRole("img", { name: /threshold breaches visible|越限已显示/i })).toBeInTheDocument());

    await waitFor(() => {
      const stored = localStorage.getItem(CANVAS_STORAGE_KEY) ?? "";
      expect(stored).toContain('"direction":"high"');
      expect(stored).toContain('"value":115');
      expect(stored).toContain('"direction":"low"');
      expect(stored).toContain('"value":100');
    });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

});
