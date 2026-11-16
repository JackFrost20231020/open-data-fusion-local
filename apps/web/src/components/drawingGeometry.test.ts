import { describe, expect, it } from "vitest";
import { matrixTransform, parsePointList, viewBoxString } from "./drawingGeometry";

describe("drawingGeometry", () => {
  it("parses point lists and SVG matrix strings", () => {
    expect(parsePointList('[{"x":1,"y":2},{"x":3,"y":4}]')).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(matrixTransform("1,0,0,1,10,20")).toBe("matrix(1 0 0 1 10 20)");
    expect(viewBoxString({ minX: 0, minY: 10, maxX: 100, maxY: 40 })).toBe("0 10 100 30");
  });
});

import { cullLabels, eventTargetIsDrawingStage, hitTargetForElement } from "./drawingGeometry";

describe("hit layer and label culling", () => {
  it("builds a minimum-size hit box so jump symbols remain clickable", () => {
    const hit = hitTargetForElement({
      nodeId: "jump-1",
      drawingMethod: "CONNECT_SYMBOL",
      worldBBox: { minX: 10, minY: 10, maxX: 11, maxY: 11 },
    });
    expect(hit?.kind).toBe("box");
    expect((hit?.box?.maxX ?? 0) - (hit?.box?.minX ?? 0)).toBeGreaterThanOrEqual(8);
  });

  it("builds polyline hit targets for pipe segments", () => {
    const hit = hitTargetForElement({
      nodeId: "pipe-1",
      drawingMethod: "PIPE_SEGMENT",
      points: '[{"x":0,"y":0},{"x":10,"y":0}]',
    });
    expect(hit?.kind).toBe("polyline");
    expect(hit?.points).toHaveLength(2);
  });

  it("culls overlapping labels and keeps higher-priority ones", () => {
    const kept = cullLabels([
      { id: "a", text: "PT001", x: 0, y: 10, width: 40, height: 10, priority: 100 },
      { id: "b", text: "label", x: 2, y: 10, width: 40, height: 10, priority: 10 },
    ], { minX: 0, minY: 0, maxX: 200, maxY: 200 });
    expect(kept.map((item) => item.id)).toEqual(["a"]);
  });

  it("recognizes events that originate inside the drawing stage", () => {
    const root = document.createElement("div");
    root.className = "industrial-canvas-stage";
    const stage = document.createElement("div");
    stage.className = "industrial-drawing-stage";
    const inner = document.createElement("span");
    stage.append(inner);
    root.append(stage);
    document.body.append(root);
    expect(eventTargetIsDrawingStage(inner)).toBe(true);
    expect(eventTargetIsDrawingStage(root)).toBe(false);
    root.remove();
  });
});
