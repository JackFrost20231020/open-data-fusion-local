import { describe, expect, it } from "vitest";
import { boxCenter, containsPoint, intersectsBox, labelWorldBox, type WorldBBox } from "./drawingGeometry";
import {
  buildHitModel,
  compactVisibleLabel,
  inspectorTitle,
  placeVisibleLabels,
  resolveDrawingHit,
  selectionAfterPageChange,
  shouldKeepInstanceResult,
  spatialNeighbors,
  type LabeledElement,
} from "./drawingSelection";

/** Synthetic ISA sensor/controller pairs with a ~15 unit gap (rounded world units). */
const page2 = {
  graphName: "2-DEMO-001",
  PT001: { nodeId: "4655", shortCode: "2-DEMO-PT001", deviceName: "PT001", componentName: "传感器1", worldBBox: { minX: 981.1353364808217, minY: 1103.2593742506801, maxX: 1009.1353364808217, maxY: 1131.2593742506801 } },
  PICA001: { nodeId: "7373", shortCode: null, deviceName: "PICA001", componentName: "控制模块", worldBBox: { minX: 1024.6353364808217, minY: 1103.7593742506801, maxX: 1051.6353364808217, maxY: 1130.7593742506801 } },
  TE003: { nodeId: "4566", shortCode: "2-DEMO-TE003", deviceName: "TE003", componentName: "传感器1", worldBBox: { minX: 980.8646635191785, minY: 1066.5300472123233, maxX: 1008.8646635191785, maxY: 1094.5300472123233 } },
  TI003: { nodeId: "7677", shortCode: null, deviceName: "TI003", componentName: "控制模块", worldBBox: { minX: 1024.3646635191785, minY: 1067.0300472123233, maxX: 1051.3646635191785, maxY: 1094.0300472123233 } },
  LT002: { nodeId: "4716", shortCode: "2-DEMO-LT002", deviceName: "LT002", componentName: "传感器1", worldBBox: { minX: 924.0, minY: 1148.530792191363, maxX: 952.0, maxY: 1176.530792191363 } },
  LICA002: { nodeId: "7604", shortCode: null, deviceName: "LICA002", componentName: "控制模块", worldBBox: { minX: 967.5, minY: 1148.530792191363, maxX: 994.5, maxY: 1176.530872191363 } },
  pipePT: { nodeId: "5291", drawingMethod: "PIPE_SEGMENT" as const, name: "861912", points: '[{"x":1008.8553364808217,"y":1117.2593742506801},{"x":1025.1753364808217,"y":1117.2593742506801}]' },
  pipeLT: { nodeId: "6745", drawingMethod: "PIPE_SEGMENT" as const, name: "861737", points: '[{"x":951.72,"y":1162.530792191363},{"x":968.04,"y":1162.530792191363}]' },
};

const page1 = {
  graphName: "1-DEMO-001",
  PT001: { nodeId: "4709", shortCode: "1-DEMO-PT001", deviceName: "PT001", componentName: "传感器1", worldBBox: { minX: 980.8198671440266, minY: 1104.021859983629, maxX: 1008.8198671440266, maxY: 1132.021859983629 } },
  PICA001: { nodeId: "7449", shortCode: null, deviceName: "PICA001", componentName: "控制模块", worldBBox: { minX: 1024.3198671440266, minY: 1104.521859983629, maxX: 1051.3198671440266, maxY: 1131.521859983629 } },
  TE003: { nodeId: "4588", shortCode: "1-DEMO-TE003", deviceName: "TE003", componentName: "传感器1", worldBBox: { minX: 980.8198671440266, minY: 1067.021859983629, maxX: 1008.8198671440266, maxY: 1095.021859983629 } },
  TI003: { nodeId: "7781", shortCode: null, deviceName: "TI003", componentName: "控制模块", worldBBox: { minX: 1024.3198671440266, minY: 1067.521859983629, maxX: 1051.3198671440266, maxY: 1094.521859983629 } },
  LT002: { nodeId: "4783", shortCode: "1-DEMO-LT002", deviceName: "LT002", componentName: "传感器1", worldBBox: { minX: 924.0, minY: 1148.3975683130072, maxX: 952.0, maxY: 1176.3975683130072 } },
  LICA002: { nodeId: "7631", shortCode: null, deviceName: "LICA002", componentName: "控制模块", worldBBox: { minX: 967.5, minY: 1148.3975683130072, maxX: 994.5, maxY: 1176.3976483130073 } },
};

const page2View: WorldBBox = { minX: 800, minY: 1000, maxX: 1200, maxY: 1300 };

const pairs = [
  ["PT001", "PICA001"],
  ["TE003", "TI003"],
  ["LT002", "LICA002"],
] as const;

type InstrumentPage = {
  graphName: string;
  PT001: LabeledElement & { worldBBox: WorldBBox };
  PICA001: LabeledElement & { worldBBox: WorldBBox };
  TE003: LabeledElement & { worldBBox: WorldBBox };
  TI003: LabeledElement & { worldBBox: WorldBBox };
  LT002: LabeledElement & { worldBBox: WorldBBox };
  LICA002: LabeledElement & { worldBBox: WorldBBox };
};

function elementsOf(page: InstrumentPage) {
  return [page.PT001, page.PICA001, page.TE003, page.TI003, page.LT002, page.LICA002];
}

function modelFor(page: InstrumentPage, extras: Array<LabeledElement & { points?: unknown; drawingMethod?: string | null }> = [], view = page2View) {
  const instruments = elementsOf(page);
  const items = [...instruments, ...extras];
  const labels = placeVisibleLabels(instruments, view);
  return { items, labels, model: buildHitModel(items, labels) };
}

describe("compactVisibleLabel / inspector titles", () => {
  it("uses existing deviceName for the in-drawing tag and keeps the full shortCode in the inspector", () => {
    expect(compactVisibleLabel(page2.PT001)).toBe("PT001");
    expect(inspectorTitle({ ...page2.PT001 })).toBe("2-DEMO-PT001");
    expect(compactVisibleLabel(page2.PICA001)).toBe("PICA001");
    expect(inspectorTitle({ ...page2.PICA001, nodeId: "7373" })).toBe("PICA001");
    expect(compactVisibleLabel({ shortCode: "2-DEMO-TE003" })).toBe("TE003");
    expect(compactVisibleLabel({ name: "unrelated" })).toBe("unrelated");
  });

  it("does not rename a controller tag to the neighboring sensor tag", () => {
    expect(compactVisibleLabel(page2.PICA001)).not.toBe("PT001");
    expect(inspectorTitle({ ...page2.LICA002, nodeId: "7604" })).toBe("LICA002");
  });
});

describe("label placement for ISA sensor / controller pairs", () => {
  it("places each visible tag so it does not cover the neighboring instrument hit box", () => {
    for (const page of [page2, page1]) {
      const { labels, model } = modelFor(page);
      for (const [sensorKey, controllerKey] of pairs) {
        const sensor = page[sensorKey];
        const controller = page[controllerKey];
        const sensorLabel = labels.find((label) => label.id === sensor.nodeId);
        const controllerLabel = labels.find((label) => label.id === controller.nodeId);
        expect(sensorLabel, `${page.graphName} ${sensorKey} label`).toBeTruthy();
        expect(controllerLabel, `${page.graphName} ${controllerKey} label`).toBeTruthy();
        expect(sensorLabel!.text).toBe(sensor.deviceName);
        expect(controllerLabel!.text).toBe(controller.deviceName);
        const sensorBox = model.find((item) => item.nodeId === sensor.nodeId)!.box!;
        const controllerBox = model.find((item) => item.nodeId === controller.nodeId)!.box!;
        expect(intersectsBox(labelWorldBox(sensorLabel!), controllerBox)).toBe(false);
        expect(intersectsBox(labelWorldBox(controllerLabel!), sensorBox)).toBe(false);
      }
    }
  });
});

describe("PT001 / TE003 / LT002 hit testing", () => {
  it("selects the sensor when clicking the sensor body or its placed label, and the controller when clicking the square", () => {
    for (const page of [page2, page1]) {
      const { model, labels } = modelFor(page, page === page2 ? [page2.pipePT, page2.pipeLT] : []);
      for (const [sensorKey, controllerKey] of pairs) {
        const sensor = page[sensorKey];
        const controller = page[controllerKey];
        const sensorCenter = boxCenter(sensor.worldBBox);
        const controllerCenter = boxCenter(controller.worldBBox);
        expect(resolveDrawingHit(sensorCenter, model).primaryId, `${page.graphName} ${sensorKey} body`).toBe(sensor.nodeId);
        expect(resolveDrawingHit(controllerCenter, model).primaryId, `${page.graphName} ${controllerKey} body`).toBe(controller.nodeId);
        const sensorLabel = labels.find((label) => label.id === sensor.nodeId)!;
        const controllerLabel = labels.find((label) => label.id === controller.nodeId)!;
        expect(resolveDrawingHit({ x: sensorLabel.x, y: sensorLabel.y }, model).primaryId).toBe(sensor.nodeId);
        expect(resolveDrawingHit({ x: controllerLabel.x, y: controllerLabel.y }, model).primaryId).toBe(controller.nodeId);
        expect(inspectorTitle({ ...sensor, nodeId: sensor.nodeId })).toContain(sensor.deviceName);
        expect(inspectorTitle({ ...controller, nodeId: controller.nodeId })).toBe(controller.deviceName);
      }
    }
  });

  it("does not let a connecting pipe steal a click that is inside the instrument body", () => {
    const { model } = modelFor(page2, [page2.pipePT]);
    const insideRightEdge = { x: 1008.9, y: 1117.2593742506801 };
    expect(containsPoint(page2.PT001.worldBBox, insideRightEdge)).toBe(true);
    const hit = resolveDrawingHit(insideRightEdge, model);
    expect(hit.primaryId).toBe("4655");
    expect(hit.reason).not.toBe("pipe");
  });

  it("keeps the same world-space hit after a zoomed / panned view, because resolution is in world coordinates", () => {
    const zoomed: WorldBBox = { minX: 960, minY: 1080, maxX: 1080, maxY: 1160 };
    const { model } = modelFor(page2, [page2.pipePT], zoomed);
    const point = boxCenter(page2.PT001.worldBBox);
    expect(resolveDrawingHit(point, model).primaryId).toBe("4655");
    expect(resolveDrawingHit(boxCenter(page2.PICA001.worldBBox), model).primaryId).toBe("7373");
  });

  it("prefers a visible label owner when that label overlaps a neighboring box (legacy overflow case)", () => {
    const { model } = modelFor(page2);
    const pica = { ...model.find((item) => item.nodeId === "7373")!, labelBox: undefined };
    const overflow = {
      ...model.find((item) => item.nodeId === "4655")!,
      labelBox: { minX: 1012, minY: 1112, maxX: 1084, maxY: 1122 },
    };
    const point = boxCenter(page2.PICA001.worldBBox);
    const hit = resolveDrawingHit(point, [overflow, pica]);
    expect(hit.primaryId).toBe("4655");
    expect(hit.reason).toBe("label");
    expect(hit.candidates.map((item) => item.nodeId)).toContain("7373");
  });

  it("when two boxes overlap, prefers the smaller area and lists the other as a candidate", () => {
    const items = [
      { nodeId: "big", kind: "box" as const, box: { minX: 0, minY: 0, maxX: 40, maxY: 40 }, area: 1600 },
      { nodeId: "small", kind: "box" as const, box: { minX: 10, minY: 10, maxX: 20, maxY: 20 }, area: 100 },
    ];
    const hit = resolveDrawingHit({ x: 15, y: 15 }, items);
    expect(hit.primaryId).toBe("small");
    expect(hit.candidates.map((item) => item.nodeId)).toEqual(["small", "big"]);
  });

  it("lists the neighboring controller as a spatial neighbor, not as a renamed selection", () => {
    const { model } = modelFor(page2);
    expect(spatialNeighbors("4655", model)).toContain("7373");
    expect(spatialNeighbors("4566", model)).toContain("7677");
    expect(spatialNeighbors("4716", model)).toContain("7604");
    expect(spatialNeighbors("4655", model)).not.toContain("4655");
  });
});

describe("cross-page selection lifetime", () => {
  it("clears the selection when changing page without an explicit jump target", () => {
    expect(selectionAfterPageChange()).toBeUndefined();
    expect(selectionAfterPageChange(null)).toBeUndefined();
    expect(selectionAfterPageChange("")).toBeUndefined();
  });

  it("keeps only the explicit target when jumping across pages", () => {
    expect(selectionAfterPageChange("4709")).toBe("4709");
  });

  it("ignores a stale instance payload after a newer selection or page change", () => {
    expect(shouldKeepInstanceResult({
      requestId: 1,
      currentRequestId: 2,
      aborted: false,
      instanceId: "4566",
      expectedId: "4566",
      instancePage: "2-DEMO-001",
      currentPage: "1-DEMO-000",
    })).toBe(false);
    expect(shouldKeepInstanceResult({
      requestId: 2,
      currentRequestId: 2,
      aborted: true,
      instanceId: "4566",
      expectedId: "4566",
      instancePage: "2-DEMO-001",
      currentPage: "2-DEMO-001",
    })).toBe(false);
    expect(shouldKeepInstanceResult({
      requestId: 2,
      currentRequestId: 2,
      aborted: false,
      instanceId: "4566",
      expectedId: "4655",
      instancePage: "2-DEMO-001",
      currentPage: "2-DEMO-001",
    })).toBe(false);
    expect(shouldKeepInstanceResult({
      requestId: 2,
      currentRequestId: 2,
      aborted: false,
      instanceId: "4566",
      expectedId: "4566",
      instancePage: "2-DEMO-001",
      currentPage: "1-DEMO-000",
    })).toBe(false);
    expect(shouldKeepInstanceResult({
      requestId: 3,
      currentRequestId: 3,
      aborted: false,
      instanceId: "4709",
      expectedId: "4709",
      instancePage: "1-DEMO-001",
      currentPage: "1-DEMO-001",
    })).toBe(true);
  });
});
