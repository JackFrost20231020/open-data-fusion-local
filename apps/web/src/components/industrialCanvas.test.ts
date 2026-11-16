import { t } from "../i18n";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bringWidgetForward,
  createEmptyCanvas,
  createWidget,
  duplicateWidget,
  loadCanvas,
  migrateCanvasState,
  saveCanvas,
  sendWidgetBackward,
  snapToGrid,
  zoomAroundPoint,
} from "./industrialCanvas";

describe("industrial canvas state", () => {
  beforeEach(() => localStorage.clear());

  it("creates, duplicates and reorders widgets without mutating the source", () => {
    const original = createWidget("asset", { x: 41, y: 59 }, 2);
    const copy = duplicateWidget(original, 7);

    expect(original).toMatchObject({ x: 40, y: 60, z: 2, title: t("Asset") });
    expect(copy).toMatchObject({ x: 64, y: 84, z: 7, title: t("{title} copy", { title: t("Asset") }) });
    expect(copy.id).not.toBe(original.id);
    expect(bringWidgetForward(original, 8).z).toBe(9);
    expect(sendWidgetBackward(original, 1).z).toBe(1);
  });

  it("keeps the same world point under the cursor while zooming", () => {
    expect(zoomAroundPoint({ x: 40, y: 30, zoom: 1 }, { x: 200, y: 120 }, 1.2)).toEqual({
      x: 8,
      y: 12,
      zoom: 1.2,
    });
    expect(snapToGrid(47)).toBe(48);
  });

  it("round-trips a versioned canvas through localStorage", () => {
    const canvas = createEmptyCanvas();
    canvas.title = "Inspection board";
    canvas.widgets = [createWidget("note", { x: 102, y: 120 }, 1)];

    saveCanvas(canvas);

    expect(loadCanvas()).toMatchObject({
      version: 1,
      title: "Inspection board",
      widgets: [{ kind: "note", x: 104, y: 120 }],
    });
  });
});

  it("migrates existing cause maps with default edge types and evidence", () => {
    const canvas = createEmptyCanvas();
    canvas.widgets = [{
      ...createWidget("causeMap", { x: 0, y: 0 }, 1),
      data: { causeLayout: "horizontal", causeNodes: [{ id: "cause-root", parentId: null, label: "Root" }, { id: "cause-child", parentId: "cause-root", label: "Child" }] },
    }];
    const migrated = migrateCanvasState(canvas);
    const child = migrated.widgets[0].data.causeNodes?.find((node) => node.id === "cause-child");
    expect(child).toMatchObject({ edgeType: "causes", collapsed: false, evidence: {} });
    expect(migrated.widgets[0].data.causeEdgeFilter).toBe("all");
  });
