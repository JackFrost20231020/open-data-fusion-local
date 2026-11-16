import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, delimiter, extname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

import { worldBBoxForInstance } from "./geometry.js";
import { sanitizeSvg, svgLooksEmpty } from "./sanitize-svg.js";
import { CaseStore, STAGING_KEY_PREFIX } from "./store.js";
import {
  DEFAULT_CASE_KEY,
  DEFAULT_CASE_SCOPE,
  type CaseImportReport,
  type CaseScope,
  type ImportSkip,
  type PageCount,
  type ParseStatus,
} from "./types.js";

function findRepoRoot(): string {
  if (process.env.ODF_ROOT?.trim()) return resolve(process.env.ODF_ROOT.trim());
  const starts = [process.cwd(), resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..")];
  for (const start of starts) {
    let current = start;
    for (let i = 0; i < 8; i += 1) {
      const pkg = join(current, "package.json");
      try {
        const name = JSON.parse(readFileSync(pkg, "utf8")).name;
        if (name === "open-data-fusion") return current;
      } catch { /* keep walking */ }
      const parent = resolve(current, "..");
      if (parent === current) break;
      current = parent;
    }
  }
  return process.cwd();
}

/** Optional default import directory. Never points at a private machine path. */
export const DEFAULT_CASE_SOURCE_DIR = process.env.ODF_CASE_DIR?.trim() ?? "";

const GENERIC_CASE_FILES = {
  graph: ["graph.ndjson", "graph.json"],
  pointTable: ["points.xml", "point-table.xml"],
  sharedPipeXlsx: ["shared-pipe.xlsx"],
  riskDoc: ["risk.doc", "risk.docx"],
  pmsPdf: ["pms.pdf"],
  taskNote: ["task.txt", "README.txt", "说明.txt"],
  drawingsPdf: ["drawings.pdf"],
  drawingsPng: ["drawings.png"],
} as const;

interface GraphNodeRecord {
  type: "node";
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

interface GraphRelRecord {
  type?: string;
  id: string;
  label: string;
  properties?: Record<string, unknown> | null;
  start: { id: string; labels?: string[]; properties?: Record<string, unknown> };
  end: { id: string; labels?: string[]; properties?: Record<string, unknown> };
}

const POINT_BLOCK = /\(TYPE="([^"]+)" NAME="([^"]+)"\s*\[(.*?)\]\s*\)/gs;
const POINT_FIELD = /([A-Z0-9_]+)="([^"]*)"/g;

export function parsePointTable(text: string): Array<{ type: string; name: string; fields: Record<string, string> }> {
  const points = [];
  for (const match of text.matchAll(POINT_BLOCK)) {
    const type = match[1];
    const name = match[2];
    const body = match[3];
    if (!type || !name || body == null) continue;
    const fields: Record<string, string> = {};
    for (const field of body.matchAll(POINT_FIELD)) {
      const key = field[1];
      const value = field[2];
      if (key != null && value != null) fields[key] = value;
    }
    points.push({ type, name, fields });
  }
  return points;
}

export function decodeMaybeGbk(buffer: Buffer): string {
  const encodings: BufferEncoding[] = ["utf8"];
  for (const encoding of encodings) {
    try {
      const text = buffer.toString(encoding);
      if (!text.includes("\uFFFD")) return text;
    } catch { /* try next */ }
  }
  try {
    return new TextDecoder("gbk").decode(buffer);
  } catch {
    return buffer.toString("utf8");
  }
}

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function heapUsed(): number {
  return process.memoryUsage().heapUsed;
}

function textOf(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function storedSvg(value: unknown): string | null {
  if (value == null) return "";
  const text = String(value);
  if (svgLooksEmpty(text)) return "";
  return sanitizeSvg(text);
}

function prop(properties: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!properties) return undefined;
  const lookup = new Map(Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    if (lookup.has(key.toLowerCase())) return lookup.get(key.toLowerCase());
  }
  return undefined;
}


export function extractConnectPointName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { pointname?: string };
    return parsed.pointname ?? null;
  } catch {
    return raw.slice(0, 80);
  }
}

interface XlsxRow {
  groupLabel: string | null;
  equipmentCode: string;
  systemName: string | null;
  logicAnalysis: string | null;
  pmsImpact: string | null;
  plsImpact: string | null;
  rowIndex: number;
}

export function parseSharedPipeRowsFromValues(values: unknown[][]): XlsxRow[] {
  if (!values.length) return [];
  const rows: XlsxRow[] = [];
  let group: string | null = null;
  for (let i = 1; i < values.length; i++) {
    const row = values[i] ?? [];
    const label = row[0] == null || row[0] === "" ? group : String(row[0]);
    if (row[0]) group = String(row[0]);
    const code = row[1] == null ? "" : String(row[1]).trim();
    if (!code) continue;
    rows.push({
      groupLabel: label,
      equipmentCode: code,
      systemName: row[2] == null ? null : String(row[2]),
      logicAnalysis: row[3] == null ? null : String(row[3]),
      pmsImpact: row[4] == null ? null : String(row[4]),
      plsImpact: row[5] == null ? null : String(row[5]),
      rowIndex: i,
    });
  }
  return rows;
}


export function defaultAllowedRoots(): string[] {
  const roots: string[] = [];
  const add = (value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) roots.push(resolve(trimmed));
  };
  add(process.env.ODF_CASE_DIR);
  for (const item of (process.env.ODF_CASE_DATA_DIRS ?? "").split(delimiter)) add(item);
  const repo = findRepoRoot();
  add(join(repo, "data", "cases"));
  add(join(repo, "examples"));
  add(join(repo, "apps", "api", "tests", "fixtures"));
  return [...new Set(roots)];
}

export function resolveAllowedSourceDir(requested: string, allowedRoots: string[] = defaultAllowedRoots()): string {
  const resolved = isAbsolute(requested) ? resolve(requested) : resolve(findRepoRoot(), requested);
  if (resolved.includes("\0")) throw Object.assign(new Error("invalid sourceDir"), { status: 400 });
  const ok = allowedRoots.some((root) => resolved === root || resolved.startsWith(root.endsWith("/") ? root : `${root}/`));
  if (!ok) {
    const error = new Error("sourceDir is outside the configured case data directory");
    (error as Error & { status: number }).status = 400;
    throw error;
  }
  if (!statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
    const error = new Error("sourceDir does not exist or is not a directory");
    (error as Error & { status: number }).status = 400;
    throw error;
  }
  return resolved;
}

export function resolveCaseFile(sourceDir: string, name: string): string {
  const resolved = resolve(sourceDir, name);
  const rel = relative(sourceDir, resolved);
  if (isAbsolute(rel) || rel.startsWith("..")) {
    const error = new Error("file path escapes sourceDir");
    (error as Error & { status: number }).status = 400;
    throw error;
  }
  return resolved;
}

function runCommand(command: string, args: string[], options: { timeout?: number; maxBuffer?: number } = {}): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunksOut: Buffer[] = [];
    const chunksErr: Buffer[] = [];
    const max = options.maxBuffer ?? 20 * 1024 * 1024;
    let size = 0;
    const onData = (chunks: Buffer[]) => (buf: Buffer) => {
      size += buf.length;
      if (size > max) {
        child.kill();
        reject(new Error(`${command} exceeded maxBuffer`));
        return;
      }
      chunks.push(buf);
    };
    child.stdout.on("data", onData(chunksOut));
    child.stderr.on("data", onData(chunksErr));
    const timer = options.timeout ? setTimeout(() => { child.kill(); reject(new Error(`${command} timed out`)); }, options.timeout) : null;
    child.on("error", (error) => { if (timer) clearTimeout(timer); reject(error); });
    child.on("close", (status) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        status: status ?? 1,
        stdout: Buffer.concat(chunksOut).toString("utf8"),
        stderr: Buffer.concat(chunksErr).toString("utf8"),
      });
    });
  });
}

const yieldEventLoop = (): Promise<void> => new Promise((resolvePromise) => setImmediate(resolvePromise));

async function parseXlsxWithPython(filePath: string): Promise<{ rows: XlsxRow[]; tool: string; note: string }> {
  const script = `
import json, sys
from openpyxl import load_workbook
wb = load_workbook(sys.argv[1], data_only=True)
ws = wb[wb.sheetnames[0]]
rows = [[c if c is None else str(c) for c in row] for row in ws.iter_rows(values_only=True)]
print(json.dumps(rows, ensure_ascii=False))
`;
  const result = await runCommand("python3", ["-c", script, filePath], { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 });
  if (result.status !== 0) throw new Error(result.stderr || "openpyxl failed");
  const values = JSON.parse(result.stdout) as unknown[][];
  return { rows: parseSharedPipeRowsFromValues(values), tool: "python3+openpyxl", note: "解析工作表第一张" };
}

async function extractPdfText(filePath: string): Promise<{ text: string; tool: string }> {
  const result = await runCommand("pdftotext", ["-layout", filePath, "-"], { maxBuffer: 20 * 1024 * 1024, timeout: 60_000 });
  if (result.status !== 0) throw new Error(result.stderr || "pdftotext failed");
  return { text: result.stdout, tool: "pdftotext" };
}

async function extractDocText(filePath: string): Promise<{ text: string; tool: string }> {
  const outDir = join(tmpdir(), `odf-case-doc-${process.pid}-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  const soffice = await runCommand("soffice", ["--headless", "--convert-to", "txt:Text", filePath, "--outdir", outDir], { timeout: 60_000 });
  if (soffice.status !== 0) throw new Error(soffice.stderr || soffice.stdout || "soffice failed");
  const base = basename(filePath, extname(filePath));
  const outPath = join(outDir, `${base}.txt`);
  const buffer = readFileSync(outPath);
  return { text: decodeMaybeGbk(buffer), tool: "soffice --convert-to txt:Text" };
}

export interface ImportCaseOptions {
  scope?: CaseScope;
  caseKey?: string;
  sourceDir?: string;
  allowedRoots?: string[];
  files?: Partial<Record<"graph" | "pointTable" | "sharedPipeXlsx" | "riskDoc" | "pmsPdf" | "taskNote" | "drawingsPdf" | "drawingsPng", string>>;
}

function resolveScope(options: ImportCaseOptions): CaseScope {
  if (options.scope) return options.scope;
  return {
    ...DEFAULT_CASE_SCOPE,
    caseKey: options.caseKey ?? DEFAULT_CASE_KEY,
  };
}

function firstExisting(sourceDir: string, names: string[]): string | null {
  for (const name of names) {
    const path = resolveCaseFile(sourceDir, name);
    if (statSync(path, { throwIfNoEntry: false })) return path;
  }
  return null;
}


const importTails = new Map<string, Promise<unknown>>();

export async function withCaseImportLock<T>(scope: CaseScope, work: () => Promise<T>): Promise<T> {
  const key = `${scope.tenantId}:${scope.projectId}:${scope.caseKey}`;
  const previous = importTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  importTails.set(key, previous.then(() => held, () => held));
  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
  }
}

function publicSourceDir(sourceDir: string): string {
  return basename(sourceDir);
}

function stagingScope(live: CaseScope, store: CaseStore): CaseScope {
  const staging: CaseScope = { ...live, caseKey: `${STAGING_KEY_PREFIX}${randomBytes(8).toString("hex")}` };
  store.registerStagingKey(live, staging.caseKey);
  return staging;
}

export async function importCase(store: CaseStore, options: ImportCaseOptions = {}): Promise<CaseImportReport> {
  const live = resolveScope(options);
  return withCaseImportLock(live, () => importCaseUnlocked(store, options, live));
}

async function importCaseUnlocked(store: CaseStore, options: ImportCaseOptions, live: CaseScope): Promise<CaseImportReport> {
  const requestedDir = (options.sourceDir ?? DEFAULT_CASE_SOURCE_DIR).trim();
  if (!requestedDir) {
    throw Object.assign(new Error("sourceDir is required (or set ODF_CASE_DIR to a local case directory)"), { status: 400 });
  }
  const sourceDir = resolveAllowedSourceDir(requestedDir, options.allowedRoots ?? defaultAllowedRoots());
  const startedAt = new Date();
  let peak = heapUsed();
  const notePeak = () => { peak = Math.max(peak, heapUsed()); };
  const skipped: ImportSkip[] = [];
  const notes: string[] = [];
  let pointsParsed = 0;
  let sharedPipeRowsParsed = 0;

  const files = options.files ?? {};
  const ndjsonPath = files.graph
    ? resolveCaseFile(sourceDir, files.graph)
    : firstExisting(sourceDir, [...GENERIC_CASE_FILES.graph]);
  if (!ndjsonPath || !statSync(ndjsonPath, { throwIfNoEntry: false })) {
    throw Object.assign(new Error("graph file not found in sourceDir"), { status: 400 });
  }

  const previous = store.getReport(live);
  store.clearStagingKeys(live);
  const staging = stagingScope(live, store);
  store.clearCase(staging);

  const pagesByGraphId = new Map<string, { graphName: string; graphDesc: string | null }>();
  let graphInfo = 0, graphInstance = 0, pipeSegments = 0, belong = 0, connects = 0, connectsCrossPage = 0, nodes = 0, rels = 0;

  const pendingBelong: Array<{ instId: string; pageId: string }> = [];
  const instancesNeedingPageName: string[] = [];

  const rl = createInterface({ input: createReadStream(ndjsonPath, { encoding: "utf8" }), crlfDelay: Infinity });
  let lineNo = 0;
  const insertBatch = (work: () => void) => store.transaction(work);
  let buffer: Array<() => void> = [];
  const flush = async () => {
    if (!buffer.length) return;
    const jobs = buffer;
    buffer = [];
    insertBatch(() => { for (const job of jobs) job(); });
    notePeak();
    await yieldEventLoop();
  };

  try {
  for await (const line of rl) {
    lineNo += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: unknown;
    try { record = JSON.parse(trimmed); }
    catch (error) {
      skipped.push({ line: lineNo, reason: `第 ${lineNo} 行 JSON 无法解析` });
      continue;
    }
    const rec = record as GraphNodeRecord | GraphRelRecord;
    const isNode = (rec as GraphNodeRecord).type === "node" || (Array.isArray((rec as GraphNodeRecord).labels) && !(rec as GraphRelRecord).start);
    if (isNode) {
      const node = rec as GraphNodeRecord;
      const labels = node.labels ?? [];
      const props = node.properties ?? {};
      const nodeKind = labels.includes("GraphInfo") ? "GraphInfo" : labels.includes("GraphInstance") ? "GraphInstance" : labels[0] ?? "Unknown";
      nodes += 1;
      if (nodeKind === "GraphInfo") {
        graphInfo += 1;
        const graphId = textOf(prop(props, "graphid", "graphId")) ?? node.id;
        pagesByGraphId.set(graphId, { graphName: textOf(prop(props, "graphname", "graphName")) ?? graphId, graphDesc: textOf(prop(props, "graphdesc", "graphDesc", "graphDec")) });
        buffer.push(() => store.insertNode(staging, {
          nodeId: node.id, labels, nodeKind, graphId,
          graphName: textOf(prop(props, "graphname", "graphName")), graphDesc: textOf(prop(props, "graphdesc", "graphDesc", "graphDec")),
          propertiesJson: JSON.stringify(props),
        }));
      } else {
        graphInstance += 1;
        if (labels.includes("DrawPipeSegment")) pipeSegments += 1;
        const graphId = textOf(prop(props, "graphid", "graphId"));
        const bboxInput = {
          matrix: textOf(prop(props, "matrix")),
          boundingBox: textOf(prop(props, "boundingbox", "BoundingBox")),
          connectPoint: textOf(prop(props, "connectpoint", "connectPoint")),
          points: textOf(prop(props, "points")),
          objSvg: textOf(prop(props, "objSvg", "objsvg", "objSVG")),
        };
        const world = worldBBoxForInstance(bboxInput);
        buffer.push(() => store.insertNode(staging, {
          nodeId: node.id, labels, nodeKind, graphId,
          instanceId: textOf(prop(props, "instanceid", "instanceId")), objId: textOf(prop(props, "objid", "objId")),
          name: textOf(prop(props, "name")), deviceName: textOf(prop(props, "devicename", "deviceName")),
          equipCode: textOf(prop(props, "equipcode", "EquipCode")),
          shortCode: textOf(prop(props, "shortcode", "ShortCode")),
          componentName: textOf(prop(props, "componentname", "componentName")), drawingMethod: textOf(prop(props, "drawingmethod", "drawingMethod")),
          matrix: bboxInput.matrix, boundingBox: bboxInput.boundingBox,
          connectPoint: bboxInput.connectPoint, points: bboxInput.points,
          objSvg: storedSvg(prop(props, "objSvg", "objsvg", "objSVG")),
          worldBBox: world, propertiesJson: JSON.stringify(props),
        }));
        if (graphId && !pagesByGraphId.has(graphId)) instancesNeedingPageName.push(node.id);
      }
    } else {
      const rel = rec as GraphRelRecord;
      rels += 1;
      const relType = rel.label || (rel as { type?: string }).type || "RELATED";
      if (relType === "BELONG") {
        belong += 1;
        pendingBelong.push({ instId: rel.start.id, pageId: rel.end.id });
      }
      if (relType === "CONNECTS") {
        connects += 1;
        const startG = textOf(prop(rel.start.properties, "graphid", "graphId"));
        const endG = textOf(prop(rel.end.properties, "graphid", "graphId"));
        if (startG && endG && startG !== endG) connectsCrossPage += 1;
      }
      buffer.push(() => store.insertRelationship(staging, {
        relId: rel.id, relType, startId: rel.start.id, endId: rel.end.id,
        connectType: textOf(prop(rel.properties, "connecttype", "connectType")),
        point: textOf(prop(rel.properties, "point")),
        fromJson: prop(rel.properties, "from", "fromJson") != null ? (typeof prop(rel.properties, "from", "fromJson") === "string" ? String(prop(rel.properties, "from", "fromJson")) : JSON.stringify(prop(rel.properties, "from", "fromJson"))) : null,
        toJson: prop(rel.properties, "to", "toJson") != null ? (typeof prop(rel.properties, "to", "toJson") === "string" ? String(prop(rel.properties, "to", "toJson")) : JSON.stringify(prop(rel.properties, "to", "toJson"))) : null,
        sId: textOf(prop(rel.properties, "sid", "sId")),
        startGraphId: textOf(prop(rel.start.properties, "graphid", "graphId")),
        endGraphId: textOf(prop(rel.end.properties, "graphid", "graphId")),
        propertiesJson: rel.properties ? JSON.stringify(rel.properties) : null,
        startSnapshotJson: rel.start.properties ? JSON.stringify(rel.start.properties) : null,
        endSnapshotJson: rel.end.properties ? JSON.stringify(rel.end.properties) : null,
      }));
    }
    if (buffer.length >= 200) await flush();
  }
  await flush();

  store.backfillGraphNames(staging);
  notePeak();
  const storedGraphNodes = store.countNodes(staging);
  const dangling = store.danglingRelationships(staging);
  const missingBelong = store.instancesMissingBelong(staging);
  const integrityNotes: string[] = [];
  if (skipped.length) integrityNotes.push(`存在 ${skipped.length} 条无法解析的图谱行`);
  if (dangling.length) integrityNotes.push(`存在 ${dangling.length} 条端点缺失的关系`);
  if (missingBelong.length) integrityNotes.push(`存在 ${missingBelong.length} 个未归属页面的图元`);
  if (storedGraphNodes === 0 || (graphInfo === 0 && graphInstance === 0)) {
    integrityNotes.push("图谱未解析出有效节点");
  }
  const integrity = {
    skippedLines: skipped.length,
    danglingRelationships: dangling.length,
    instancesMissingBelong: missingBelong.length,
    complete: integrityNotes.length === 0,
    notes: integrityNotes,
  };
  if (!integrity.complete) {
    throw Object.assign(new Error(`图谱不完整，已取消替换并保留原数据：${integrityNotes.join("；")}`), { status: 400, integrity });
  }

  const addFile = async (role: string, fileName: string | null, parse: (() => Promise<{ text?: string; tool?: string; note?: string; extra?: () => void }>) | null, statusWhenOk?: ParseStatus) => {
    if (!fileName) {
      notes.push(`${role} 未在源目录中找到，已跳过`);
      return;
    }
    const path = fileName.startsWith("/") ? fileName : resolveCaseFile(sourceDir, fileName);
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat) {
      skipped.push({ line: 0, reason: `${role} missing: ${basename(path)}` });
      return;
    }
    let parseStatus: ParseStatus = "skipped";
    let parseTool: string | null = null;
    let parseNote: string | null = null;
    let extractedText: string | null = null;
    if (parse) {
      try {
        const result = await parse();
        extractedText = result.text ?? null;
        parseTool = result.tool ?? null;
        parseNote = result.note ?? null;
        parseStatus = statusWhenOk ?? "parsed";
        result.extra?.();
      } catch (error) {
        parseStatus = "failed";
        parseNote = (error as Error).message;
        skipped.push({ line: 0, reason: `${role} parse failed: ${parseNote}` });
      }
    } else {
      parseStatus = statusWhenOk ?? "attached_only";
    }
    store.insertDocument(staging, {
      fileName: basename(path), relativePath: relative(sourceDir, path) || basename(path),
      role, byteSize: stat.size, sha256: fileSha256(path),
      mimeType: mimeOf(path), parseStatus, parseTool, parseNote, extractedText,
    });
    await yieldEventLoop();
  };

  const pointPath = files.pointTable
    ? resolveCaseFile(sourceDir, files.pointTable)
    : firstExisting(sourceDir, [...GENERIC_CASE_FILES.pointTable]);
  await addFile("point-table", pointPath, async () => {
    const text = decodeMaybeGbk(readFileSync(pointPath!));
    const points = parsePointTable(text);
    return {
      text, tool: "builtin-point-table", note: `${points.length} points`,
      extra: () => { for (const point of points) store.insertPoint(staging, point.type, point.name, point.fields); pointsParsed = points.length; },
    };
  });

  const xlsxPath = files.sharedPipeXlsx
    ? resolveCaseFile(sourceDir, files.sharedPipeXlsx)
    : firstExisting(sourceDir, [...GENERIC_CASE_FILES.sharedPipeXlsx]);
  await addFile("shared-pipe-xlsx", xlsxPath, async () => {
    const parsed = await parseXlsxWithPython(xlsxPath!);
    return {
      tool: parsed.tool, note: parsed.note,
      extra: () => { for (const row of parsed.rows) store.insertSharedPipeRow(staging, row); sharedPipeRowsParsed = parsed.rows.length; },
    };
  });

  const docPath = files.riskDoc
    ? resolveCaseFile(sourceDir, files.riskDoc)
    : firstExisting(sourceDir, [...GENERIC_CASE_FILES.riskDoc]);
  await addFile("risk-doc", docPath, async () => extractDocText(docPath!));

  const pmsPath = files.pmsPdf
    ? resolveCaseFile(sourceDir, files.pmsPdf)
    : firstExisting(sourceDir, [...GENERIC_CASE_FILES.pmsPdf]);
  await addFile("pms-pdf", pmsPath, async () => extractPdfText(pmsPath!));

  const taskPath = files.taskNote
    ? resolveCaseFile(sourceDir, files.taskNote)
    : firstExisting(sourceDir, [...GENERIC_CASE_FILES.taskNote]);
  await addFile("task-note", taskPath, async () => ({ text: decodeMaybeGbk(readFileSync(taskPath!)), tool: "decodeMaybeGbk" }));

  const drawingPdf = files.drawingsPdf
    ? resolveCaseFile(sourceDir, files.drawingsPdf)
    : firstExisting(sourceDir, [...GENERIC_CASE_FILES.drawingsPdf]);
  await addFile("drawings-pdf", drawingPdf, null, "attached_only");
  await addFile("graph", ndjsonPath, null, "imported");
  const drawingPng = (files as { drawingsPng?: string }).drawingsPng
    ? resolveCaseFile(sourceDir, (files as { drawingsPng?: string }).drawingsPng!)
    : firstExisting(sourceDir, [...GENERIC_CASE_FILES.drawingsPng]);
  await addFile("drawings-image", drawingPng, null, "attached_only");

  const emptyObjSvg = store.countEmptyObjSvg(staging);
  const sourceWarnings = store.listSourceWarnings(staging);
  notes.push(...sourceWarnings);
  notes.push(`空 objSvg ${emptyObjSvg} 个，已按空字符串存储`);
  if (previous) notes.push("重新导入：先写入暂存再交换，失败时保留原数据");

  const pages = store.listPages(staging);
  const documents = store.listDocuments(staging).map((doc) => ({
    fileName: doc.fileName,
    parseStatus: doc.parseStatus,
    parseTool: doc.parseTool,
    parseNote: doc.parseNote,
    byteSize: doc.byteSize,
  }));
  const report: CaseImportReport = {
    caseKey: live.caseKey,
    tenantId: live.tenantId,
    projectId: live.projectId,
    sourceDir: publicSourceDir(sourceDir),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    peakHeapBytes: peak,
    expected: null,
    integrity,
    nodes: { total: nodes, graphInfo, graphInstance, pipeSegments },
    relationships: { total: rels, belong, connects, connectsCrossPage },
    pages: pages.map((page) => ({ graphId: page.graphId, graphName: page.graphName, instances: page.instanceCount })),
    skipped,
    documents,
    pointsParsed,
    sharedPipeRowsParsed,
    replacedPreviousImport: Boolean(previous),
    notes,
    emptyObjSvg,
    sourceWarnings,
  };
  report.nodes.total = store.countNodes(staging);
  report.relationships.total = store.countRelationships(staging);
  if (report.nodes.total === 0) {
    throw Object.assign(new Error("图谱未解析出有效节点，已取消替换并保留原数据"), { status: 400 });
  }
  store.saveReport(staging, report);
  store.swapStaging(live, staging.caseKey);
  report.nodes.total = store.countNodes(live);
  report.relationships.total = store.countRelationships(live);
  return report;
  } catch (error) {
    try { store.clearCase(staging); } catch { /* keep live data */ }
    throw error;
  }
}

function mimeOf(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".xml") return "application/xml";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".doc") return "application/msword";
  if (ext === ".json") return "application/json";
  if (ext === ".txt") return "text/plain";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}
