import type { Express, Request, Response } from "express";
import { z } from "zod";

import { analyzeCase } from "./analysis.js";
import { extractConnectPointName, importCase } from "./import-case.js";
import { CaseStore, isReservedStagingCaseKey } from "./store.js";
import { DEFAULT_CASE_SCOPE, type CaseScope, type SharedPipeOptions } from "./types.js";

interface Scope {
  userId: string;
  tenantId?: string;
  projectId?: string;
}

const fileNameSchema = z.string().trim().min(1).max(255).refine((value) => !value.includes("/") && !value.includes("\\") && !value.includes(".."), "file names must not contain a path");

function scopeFrom(request: Request, caseKey: string, identity: Scope): CaseScope {
  const query = z.object({
    tenant: z.string().trim().min(1).max(128).optional(),
    project: z.string().trim().min(1).max(128).optional(),
  }).parse(request.query);
  return {
    tenantId: identity.tenantId || query.tenant || DEFAULT_CASE_SCOPE.tenantId,
    projectId: identity.projectId || query.project || DEFAULT_CASE_SCOPE.projectId,
    caseKey,
  };
}

function redactReport<T extends { sourceDir?: string } | null>(report: T): T {
  if (!report || !report.sourceDir) return report;
  const src = report.sourceDir;
  if (src.startsWith("/") || src.includes("\\") || src.includes(":\\")) {
    return { ...report, sourceDir: src.split("/").filter(Boolean).at(-1) ?? "case-data" };
  }
  return report;
}

export function registerCaseRoutes(
  app: Express,
  store: CaseStore,
  requireRead: (request: Request) => Promise<Scope>,
  requireImport: (request: Request) => Promise<Scope>,
): void {
  const caseKeyParam = z.string().trim().min(1).max(64).refine((value) => !isReservedStagingCaseKey(value), "caseKey cannot address a staging partition");

  app.post("/api/v1/cases/:caseKey/import", async (request, response) => {
    const identity = await requireImport(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    const body = z.object({
      sourceDir: z.string().trim().min(1).max(512).optional(),
      files: z.object({
        graph: fileNameSchema.optional(),
        pointTable: fileNameSchema.optional(),
        sharedPipeXlsx: fileNameSchema.optional(),
        riskDoc: fileNameSchema.optional(),
        pmsPdf: fileNameSchema.optional(),
        taskNote: fileNameSchema.optional(),
        drawingsPdf: fileNameSchema.optional(),
        drawingsPng: fileNameSchema.optional(),
      }).optional(),
    }).parse(request.body ?? {});
    const scope = scopeFrom(request, caseKey, identity);
    const report = await importCase(store, { scope, sourceDir: body.sourceDir, files: body.files });
    response.json(redactReport(report));
  });

  app.get("/api/v1/cases/:caseKey/import/report", async (request, response) => {
    const identity = await requireRead(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    const report = redactReport(store.getReport(scopeFrom(request, caseKey, identity)));
    if (!report) {
      response.status(404).json({ error: { code: "not_found", message: "尚未导入该案例" } });
      return;
    }
    response.json(report);
  });

  app.get("/api/v1/cases/:caseKey/pages", async (request, response) => {
    const identity = await requireRead(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    response.json({ pages: store.listPages(scopeFrom(request, caseKey, identity)) });
  });

  app.get("/api/v1/cases/:caseKey/pages/:graphName/elements", async (request, response) => {
    const identity = await requireRead(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    const graphName = z.string().trim().min(1).max(128).parse(request.params.graphName);
    const query = z.object({
      minX: z.coerce.number().optional(),
      minY: z.coerce.number().optional(),
      maxX: z.coerce.number().optional(),
      maxY: z.coerce.number().optional(),
      includeSvg: z.enum(["true", "false"]).optional(),
    }).parse(request.query);
    const includeSvg = query.includeSvg !== "false";
    const viewport = { minX: query.minX, minY: query.minY, maxX: query.maxX, maxY: query.maxY };
    const scope = scopeFrom(request, caseKey, identity);
    const elements = includeSvg
      ? store.pageSvgPayload(scope, graphName, viewport)
      : store.listPageElements(scope, graphName, viewport);
    const boxes = elements.map((item) => item.worldBBox).filter(Boolean) as Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
    const extent = boxes.length ? boxes.reduce((acc, box) => ({
      minX: Math.min(acc.minX, box.minX), minY: Math.min(acc.minY, box.minY),
      maxX: Math.max(acc.maxX, box.maxX), maxY: Math.max(acc.maxY, box.maxY),
    })) : null;
    response.json({ graphName, count: elements.length, extent, elements });
  });

  app.get("/api/v1/cases/:caseKey/instances/:id", async (request, response) => {
    const identity = await requireRead(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    const id = z.string().trim().min(1).max(64).parse(request.params.id);
    const scope = scopeFrom(request, caseKey, identity);
    const instance = store.getInstance(scope, id);
    if (!instance) {
      response.status(404).json({ error: { code: "not_found", message: "未找到该图元" } });
      return;
    }
    const connections = store.getRelationshipsForNode(scope, id);
    const peers = connections.map((rel) => {
      const otherId = rel.startId === id ? rel.endId : rel.startId;
      const other = store.getInstance(scope, otherId);
      const outgoing = rel.startId === id;
      const pointName = extractConnectPointName(outgoing ? rel.fromJson : rel.toJson)
        ?? extractConnectPointName(rel.point);
      const otherPointName = extractConnectPointName(outgoing ? rel.toJson : rel.fromJson);
      const otherName = other
        ? (other.shortCode || other.equipCode || other.deviceName || other.name || other.componentName || other.nodeId)
        : otherId;
      return {
        rel,
        other: other ? { ...other, objSvg: undefined, properties: undefined } : { nodeId: otherId, name: otherId },
        otherName,
        connectPointName: pointName,
        otherConnectPointName: otherPointName,
        crossPage: Boolean(other && instance.graphId && other.graphId && other.graphId !== instance.graphId),
      };
    });
    response.json({ instance, connections, peers });
  });

  app.get("/api/v1/cases/:caseKey/documents", async (request, response) => {
    const identity = await requireRead(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    const documents = store.listDocuments(scopeFrom(request, caseKey, identity)).map((doc) => ({
      ...doc,
      extractedText: undefined,
      extractedTextLength: doc.extractedText?.length ?? 0,
    }));
    response.json({ documents });
  });

  app.get("/api/v1/cases/:caseKey/documents/:id", async (request, response) => {
    const identity = await requireRead(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    const id = z.coerce.number().parse(request.params.id);
    const document = store.listDocuments(scopeFrom(request, caseKey, identity)).find((item) => item.id === id);
    if (!document) {
      response.status(404).json({ error: { code: "not_found", message: "未找到该文档" } });
      return;
    }
    response.json(document);
  });

  app.get("/api/v1/cases/:caseKey/analysis", async (request, response) => {
    const identity = await requireRead(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    const scope = scopeFrom(request, caseKey, identity);
    if (!store.getReport(scope)) {
      response.status(404).json({ error: { code: "not_found", message: "尚未导入该案例" } });
      return;
    }
    const query = z.object({
      instrument: z.string().trim().min(1).max(128).optional(),
      hopLimit: z.coerce.number().int().min(1).max(64).optional(),
      traverseInstruments: z.enum(["true", "false"]).optional(),
    }).parse(request.query);
    const options: SharedPipeOptions = {
      hopLimit: query.hopLimit,
      traverseInstruments: query.traverseInstruments === "true",
    };
    const analysis = analyzeCase(store, scope, query.instrument ?? "", options);
    response.json(analysis);
  });

  app.get("/api/v1/cases/:caseKey/points", async (request, response) => {
    const identity = await requireRead(request);
    const caseKey = caseKeyParam.parse(request.params.caseKey);
    response.json({ points: store.listPoints(scopeFrom(request, caseKey, identity)) });
  });

  void Response;
}
