import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeCase, matchesQuery, traverseSharedPipe } from "../src/case/analysis.js";
import { parseMatrix, worldBBoxForInstance } from "../src/case/geometry.js";
import { importCase, parsePointTable, parseSharedPipeRowsFromValues, resolveAllowedSourceDir } from "../src/case/import-case.js";
import { CaseStore } from "../src/case/store.js";
import { FusionDatabase } from "../src/database.js";

const fixtureDir = fileURLToPath(new URL("./fixtures/synth-case", import.meta.url));

describe("case geometry", () => {
  it("applies SVG matrix and bounding box to world coordinates", () => {
    const bbox = worldBBoxForInstance({
      matrix: "2,0,0,2,10,20",
      boundingBox: '[{"x":0,"y":0},{"x":10,"y":0},{"x":10,"y":5},{"x":0,"y":5}]',
    });
    expect(parseMatrix("2,0,0,2,10,20")).toEqual([2, 0, 0, 2, 10, 20]);
    expect(bbox).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 30 });
  });
});

describe("point table and xlsx parsers", () => {
  it("parses AnalogPoint blocks without treating the file as XML", () => {
    const points = parsePointTable(`
      (TYPE="AnalogPoint" NAME="DEMO-PT001"
       [IO_LOCATION="1.4.4" DESCRIPTION="Press"]
      )
    `);
    expect(points).toEqual([
      { type: "AnalogPoint", name: "DEMO-PT001", fields: { IO_LOCATION: "1.4.4", DESCRIPTION: "Press" } },
    ]);
  });

  it("parses a 共管 sheet including the inherited group label", () => {
    const rows = parseSharedPipeRowsFromValues([
      ["序号", "设备编码", "系统", "逻辑分析", "PMS", "PLS"],
      ["共管", "DEMO-LT002", "PMS", "液位", "a", "b"],
      [null, "DEMO-PT001", "PMS", "压力", "c", "d"],
    ]);
    expect(rows).toHaveLength(2);
    const second = rows[1];
    expect(second).toBeDefined();
    expect(second!.groupLabel).toBe("共管");
    expect(second!.equipmentCode).toBe("DEMO-PT001");
  });
});

describe("case import and analysis", () => {
  let tempDirectory: string;
  let database: FusionDatabase;

  afterEach(() => {
    database?.close?.();
    if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  });

  function setup() {
    tempDirectory = mkdtempSync(join(tmpdir(), "odf-case-"));
    database = new FusionDatabase({ path: join(tempDirectory, "test.db"), seed: false });
    return new CaseStore(database.database);
  }

  it("streams a fixture NDJSON graph idempotently and preserves svg, matrix, and CONNECTS endpoints", async () => {
    const store = setup();
    const report = await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    expect(report.nodes.total).toBe(7);
    expect(report.nodes.graphInfo).toBe(2);
    expect(report.nodes.graphInstance).toBe(5);
    expect(report.nodes.pipeSegments).toBe(1);
    expect(report.relationships.belong).toBe(5);
    expect(report.relationships.connects).toBe(3);
    expect(report.relationships.connectsCrossPage).toBe(1);
    expect(report.skipped).toEqual([]);
    expect(report.integrity.complete).toBe(true);
    expect(report.pointsParsed).toBe(4);
    expect(report.sharedPipeRowsParsed).toBe(2);
    expect(report.pages.map((page) => page.graphName).sort()).toEqual(["1-DEMO-001", "2-DEMO-001"]);

    const instance = store.getInstance("demo", "n-pt");
    expect(instance?.objSvg).toBe('<g xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></g>');
    expect(instance?.matrix).toBe("1,0,0,1,10,20");
    expect(instance?.worldBBox).toEqual({ minX: 10, minY: 20, maxX: 20, maxY: 30 });

    const connections = store.getRelationshipsForNode("demo", "n-pt");
    expect(connections.some((rel) => rel.relType === "CONNECTS" && rel.endId === "n-pipe" && rel.fromJson?.includes("cp1"))).toBe(true);

    const again = await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    expect(again.replacedPreviousImport).toBe(true);
    expect(again.nodes.total).toBe(7);
    expect(again.relationships.total).toBe(8);
    expect(store.listPages("demo")).toHaveLength(2);
  });

  it("finds shared-pipe instruments by traversing CONNECTS and cross-checks the xlsx list", async () => {
    const store = setup();
    await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    const analysis = analyzeCase(store, "demo", "DEMO-PT001");
    expect(analysis.aliasesPreserved.taskTag).toBe("DEMO-PT000");
    expect(analysis.aliasesPreserved.packageTag).toBe("DEMO-PT001");
    expect(analysis.targetInstruments.some((item) => item.shortCode === "1-DEMO-PT001")).toBe(true);
    expect(analysis.sharedPipe.derivedFromGraph.map((item) => item.deviceName)).toContain("LT002");
    expect(analysis.sharedPipe.agreement).toContain("LT002");
    expect(analysis.singleChannel.impacts.some((item) => item.source === "xlsx")).toBe(true);
    expect(analysis.sharedCard.fromPointTable.some((item) => item.tag === "DEMO-FT999")).toBe(true);
    expect(analysis.sharedCard.fromPointTable.some((item) => item.tag === "DEMO-PT001-1")).toBe(false);
    expect(analysis.sharedPipe.needsEngineeringConfirmation).toBe(true);
  });

  it("rejects a sourceDir outside the allowlist and leaves existing data in place on a failed re-import", async () => {
    const store = setup();
    await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    expect(store.listPages("demo")).toHaveLength(2);
    expect(() => resolveAllowedSourceDir("/etc", [fixtureDir])).toThrow(/outside the configured case data directory/);
    await expect(importCase(store, { caseKey: "demo", sourceDir: "/etc/passwd", allowedRoots: [fixtureDir] })).rejects.toThrow();
    expect(store.listPages("demo")).toHaveLength(2);
    expect(store.getInstance("demo", "n-pt")?.shortCode ?? store.getInstance("demo", "n-pt")?.nodeId).toBeTruthy();
  });

  it("rolls back an in-transaction write and keeps prior import data if staging swap cannot complete", async () => {
    const store = setup();
    await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    expect(() => store.transaction(() => {
      store.clearCase("demo");
      throw new Error("boom");
    })).toThrow("boom");
    expect(store.listPages("demo")).toHaveLength(2);
  });

  it("rejects a non-graph file as the graph and leaves the previous import intact", async () => {
    const store = setup();
    await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    expect(store.listPages("demo")).toHaveLength(2);
    await expect(importCase(store, {
      caseKey: "demo",
      sourceDir: fixtureDir,
      allowedRoots: [fixtureDir],
      files: { graph: "task.txt" },
    })).rejects.toMatchObject({ message: expect.stringContaining("有效节点"), status: 400 });
    expect(store.listPages("demo")).toHaveLength(2);
    expect(store.countNodes("demo")).toBe(7);
  });

  it("serializes concurrent imports of the same case and keeps a consistent graph", async () => {
    const store = setup();
    const first = importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    const second = importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    const reports = await Promise.all([first, second]);
    expect(reports.every((report) => report.nodes.total === 7)).toBe(true);
    expect(store.countNodes("demo")).toBe(7);
    expect(store.countRelationships("demo")).toBe(8);
    expect(store.listPages("demo")).toHaveLength(2);
  });

  it("records graph documents as imported and does not use a blanket ok status", async () => {
    const store = setup();
    const report = await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    expect(report.sourceDir).not.toMatch(/^\//);
    const graph = report.documents.find((doc) => /graph|ndjson|json/i.test(doc.fileName));
    expect(graph?.parseStatus).toBe("imported");
    expect(report.documents.every((doc) => doc.parseStatus !== "ok")).toBe(true);
  });

  it("returns not-found for an unknown tag instead of a canned package-tag conclusion", async () => {
    const store = setup();
    await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    const missing = analyzeCase(store, "demo", "DEMO-PT000");
    expect(missing.found).toBe(false);
    expect(missing.notFoundReason).toMatch(/未找到/);
    expect(missing.singleChannel.impacts).toEqual([]);
    expect(missing.aliasesPreserved.taskTag).toBe("DEMO-PT001");
    expect(missing.aliasesPreserved.packageTag).toBe("DEMO-PT000");
  });

  it("does not treat leftover documents on an empty graph as a found case", () => {
    const store = setup();
    const analysis = analyzeCase(store, "demo", "DEMO-PT001");
    expect(analysis.found).toBe(false);
    expect(analysis.notFoundReason).toMatch(/图谱中没有节点/);
    expect(analysis.sharedCard.fromPmsPdf).toEqual([]);
    expect(analysis.sharedCard.excludedByDoc).toEqual([]);
    expect(analysis.singleChannel.impacts).toEqual([]);
  });

  it("rejects a truncated or internally inconsistent graph and keeps the previous import", async () => {
    const store = setup();
    await importCase(store, { caseKey: "demo", sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    expect(store.countNodes("demo")).toBe(7);
    expect(store.countRelationships("demo")).toBe(8);

    await expect(importCase(store, {
      caseKey: "demo",
      sourceDir: fixtureDir,
      allowedRoots: [fixtureDir],
      files: { graph: "graph-truncated.ndjson" },
    })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("不完整") });
    expect(store.countNodes("demo")).toBe(7);
    expect(store.countRelationships("demo")).toBe(8);

    await expect(importCase(store, {
      caseKey: "demo",
      sourceDir: fixtureDir,
      allowedRoots: [fixtureDir],
      files: { graph: "graph-dangling.ndjson" },
    })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("不完整") });
    expect(store.countNodes("demo")).toBe(7);

    await expect(importCase(store, {
      caseKey: "demo",
      sourceDir: fixtureDir,
      allowedRoots: [fixtureDir],
      files: { graph: "graph-no-belong.ndjson" },
    })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("不完整") });
    expect(store.countNodes("demo")).toBe(7);
    expect(store.countRelationships("demo")).toBe(8);
  });

  it("does not delete a formal case whose name looks like a staging LIKE pattern", async () => {
    const store = setup();
    const victimKey = "eval-r3-patternXXstagingYYvictim";
    await importCase(store, { caseKey: victimKey, sourceDir: fixtureDir, allowedRoots: [fixtureDir] });
    expect(store.countNodes(victimKey)).toBe(7);
    expect(store.countRelationships(victimKey)).toBe(8);
    await expect(importCase(store, {
      caseKey: "eval-r3-pattern",
      sourceDir: fixtureDir,
      allowedRoots: [fixtureDir],
      files: { graph: "does-not-exist.ndjson" },
    })).rejects.toMatchObject({ status: 400 });
    expect(store.countNodes(victimKey)).toBe(7);
    expect(store.countRelationships(victimKey)).toBe(8);
    expect(store.getReport(victimKey)?.nodes.total).toBe(7);
  });
});
