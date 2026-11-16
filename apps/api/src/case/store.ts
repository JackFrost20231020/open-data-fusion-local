import type { DatabaseSync } from "node:sqlite";

import { sanitizeSvg } from "./sanitize-svg.js";
import type {
  CaseDocumentRecord,
  CaseImportReport,
  CaseScope,
  GraphInstanceDetail,
  GraphInstanceSummary,
  GraphPage,
  GraphRelationship,
  ParseStatus,
  PointRecord,
  SharedPipeRow,
} from "./types.js";
import { DEFAULT_CASE_SCOPE } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS case_imports (
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  case_key TEXT NOT NULL,
  source_dir TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  report_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, project_id, case_key)
);

CREATE TABLE IF NOT EXISTS case_graph_nodes (
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  case_key TEXT NOT NULL,
  node_id TEXT NOT NULL,
  labels_json TEXT NOT NULL,
  node_kind TEXT NOT NULL,
  graph_id TEXT,
  graph_name TEXT,
  graph_desc TEXT,
  instance_id TEXT,
  obj_id TEXT,
  name TEXT,
  device_name TEXT,
  equip_code TEXT,
  short_code TEXT,
  component_name TEXT,
  drawing_method TEXT,
  matrix TEXT,
  bounding_box TEXT,
  connect_point TEXT,
  points TEXT,
  obj_svg TEXT,
  world_min_x REAL,
  world_min_y REAL,
  world_max_x REAL,
  world_max_y REAL,
  properties_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, project_id, case_key, node_id)
);
CREATE INDEX IF NOT EXISTS case_graph_nodes_page ON case_graph_nodes (tenant_id, project_id, case_key, graph_id);
CREATE INDEX IF NOT EXISTS case_graph_nodes_short ON case_graph_nodes (tenant_id, project_id, case_key, short_code);
CREATE INDEX IF NOT EXISTS case_graph_nodes_equip ON case_graph_nodes (tenant_id, project_id, case_key, equip_code);

CREATE TABLE IF NOT EXISTS case_graph_relationships (
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  case_key TEXT NOT NULL,
  rel_id TEXT NOT NULL,
  rel_type TEXT NOT NULL,
  start_id TEXT NOT NULL,
  end_id TEXT NOT NULL,
  connect_type TEXT,
  point TEXT,
  from_json TEXT,
  to_json TEXT,
  s_id TEXT,
  start_graph_id TEXT,
  end_graph_id TEXT,
  properties_json TEXT,
  start_snapshot_json TEXT,
  end_snapshot_json TEXT,
  PRIMARY KEY (tenant_id, project_id, case_key, rel_id)
);
CREATE INDEX IF NOT EXISTS case_graph_rel_type ON case_graph_relationships (tenant_id, project_id, case_key, rel_type);
CREATE INDEX IF NOT EXISTS case_graph_rel_start ON case_graph_relationships (tenant_id, project_id, case_key, start_id);
CREATE INDEX IF NOT EXISTS case_graph_rel_end ON case_graph_relationships (tenant_id, project_id, case_key, end_id);

CREATE TABLE IF NOT EXISTS case_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  case_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  role TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT,
  mime_type TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  parse_tool TEXT,
  parse_note TEXT,
  extracted_text TEXT,
  UNIQUE (tenant_id, project_id, case_key, relative_path)
);

CREATE TABLE IF NOT EXISTS case_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  case_key TEXT NOT NULL,
  point_type TEXT NOT NULL,
  name TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  UNIQUE (tenant_id, project_id, case_key, name)
);

CREATE TABLE IF NOT EXISTS case_shared_pipe_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  case_key TEXT NOT NULL,
  group_label TEXT,
  equipment_code TEXT NOT NULL,
  system_name TEXT,
  logic_analysis TEXT,
  pms_impact TEXT,
  pls_impact TEXT,
  row_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS case_staging_registry (
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  live_case_key TEXT NOT NULL,
  staging_case_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, project_id, staging_case_key)
);
CREATE INDEX IF NOT EXISTS case_staging_registry_live
  ON case_staging_registry (tenant_id, project_id, live_case_key);
`;

const CASE_TABLES = [
  "case_shared_pipe_rows",
  "case_points",
  "case_documents",
  "case_graph_relationships",
  "case_graph_nodes",
  "case_imports",
] as const;

export const STAGING_KEY_PREFIX = ".odf-stg.";

export function isReservedStagingCaseKey(caseKey: string): boolean {
  return caseKey.startsWith(STAGING_KEY_PREFIX) || caseKey.includes("__staging");
}

/** Old leftover keys only: `${live}__staging` or `${live}__staging__<hex>`. Never SQL LIKE. */
export function isLegacyStagingKeyForLive(caseKey: string, liveCaseKey: string): boolean {
  const prefix = `${liveCaseKey}__staging`;
  if (caseKey === prefix) return true;
  if (!caseKey.startsWith(`${prefix}__`)) return false;
  return /^[0-9a-f]+$/i.test(caseKey.slice(prefix.length + 2));
}

function tableExists(database: DatabaseSync, name: string): boolean {

  const row = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) as { name: string } | undefined;
  return Boolean(row);
}

function tableColumns(database: DatabaseSync, name: string): string[] {
  return (database.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>).map((row) => row.name);
}

function migrateLegacyCaseTables(database: DatabaseSync): void {
  if (!tableExists(database, "case_graph_nodes")) return;
  if (tableColumns(database, "case_graph_nodes").includes("tenant_id")) return;

  const tenant = DEFAULT_CASE_SCOPE.tenantId;
  const project = DEFAULT_CASE_SCOPE.projectId;
  database.exec("BEGIN IMMEDIATE");
  try {
const statements = SCHEMA.split(";").map((item) => item.trim()).filter((item) => item.startsWith("CREATE TABLE"));
    const byName = new Map<string, string>();
    for (const statement of statements) {
      const match = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (match?.[1]) byName.set(match[1], `${statement};`);
    }

    const copies: Record<string, string> = {
      case_imports: "SELECT ?, ?, case_key, source_dir, started_at, finished_at, report_json FROM case_imports__legacy",
      case_graph_nodes: "SELECT ?, ?, case_key, node_id, labels_json, node_kind, graph_id, graph_name, graph_desc, instance_id, obj_id, name, device_name, equip_code, short_code, component_name, drawing_method, matrix, bounding_box, connect_point, points, obj_svg, world_min_x, world_min_y, world_max_x, world_max_y, properties_json FROM case_graph_nodes__legacy",
      case_graph_relationships: "SELECT ?, ?, case_key, rel_id, rel_type, start_id, end_id, connect_type, point, from_json, to_json, s_id, start_graph_id, end_graph_id, properties_json, start_snapshot_json, end_snapshot_json FROM case_graph_relationships__legacy",
      case_documents: "SELECT id, ?, ?, case_key, file_name, relative_path, role, byte_size, sha256, mime_type, parse_status, parse_tool, parse_note, extracted_text FROM case_documents__legacy",
      case_points: "SELECT id, ?, ?, case_key, point_type, name, fields_json FROM case_points__legacy",
      case_shared_pipe_rows: "SELECT id, ?, ?, case_key, group_label, equipment_code, system_name, logic_analysis, pms_impact, pls_impact, row_index FROM case_shared_pipe_rows__legacy",
    };

    for (const table of Object.keys(copies)) {
      if (!tableExists(database, table) || tableColumns(database, table).includes("tenant_id")) continue;
      const ddl = byName.get(table);
      if (!ddl) throw new Error(`missing ddl for ${table}`);
      database.exec(`ALTER TABLE ${table} RENAME TO ${table}__legacy`);
      database.exec(ddl);
      database.prepare(`INSERT INTO ${table} ${copies[table]!}`).run(tenant, project);
      database.exec(`DROP TABLE ${table}__legacy`);
    }
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  }
}

export class CaseStore {
  private txDepth = 0;

  constructor(readonly database: DatabaseSync) {
    migrateLegacyCaseTables(database);
    this.database.exec(SCHEMA);
  }

  transaction<T>(work: () => T): T {
    if (this.txDepth > 0) return work();
    this.database.exec("BEGIN IMMEDIATE");
    this.txDepth += 1;
    try {
      const result = work();
      this.database.exec("COMMIT");
      this.txDepth -= 1;
      return result;
    } catch (error) {
      try { this.database.exec("ROLLBACK"); } catch { /* ignore */ }
      this.txDepth = 0;
      throw error;
    }
  }

  private asScope(scope: CaseScope | string | string): CaseScope {
    return typeof scope === "string" ? { tenantId: DEFAULT_CASE_SCOPE.tenantId, projectId: DEFAULT_CASE_SCOPE.projectId, caseKey: scope } : scope;
  }

  private params(scope: CaseScope | string | string): [string, string, string] {
    const resolved = this.asScope(scope);
    return [resolved.tenantId, resolved.projectId, resolved.caseKey];
  }

  clearCase(scope: CaseScope | string): void {
    const run = () => {
      for (const table of CASE_TABLES) {
        this.database.prepare(`DELETE FROM ${table} WHERE tenant_id = ? AND project_id = ? AND case_key = ?`).run(...this.params(scope));
      }
    };
    if (this.txDepth > 0) run();
    else this.transaction(run);
  }

  /** Atomically replace live case data with a staging case key in the same tenant/project. */
  swapStaging(live: CaseScope, stagingKey: string): void {
    this.transaction(() => {
      const staging: CaseScope = { ...live, caseKey: stagingKey };
      for (const table of CASE_TABLES) {
        this.database.prepare(`DELETE FROM ${table} WHERE tenant_id = ? AND project_id = ? AND case_key = ?`).run(...this.params(live));
        this.database.prepare(`UPDATE ${table} SET case_key = ? WHERE tenant_id = ? AND project_id = ? AND case_key = ?`).run(live.caseKey, ...this.params(staging));
      }
    });
  }

  registerStagingKey(live: CaseScope, stagingKey: string): void {
    this.database.prepare(
      `INSERT OR REPLACE INTO case_staging_registry (tenant_id, project_id, live_case_key, staging_case_key, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(live.tenantId, live.projectId, live.caseKey, stagingKey, new Date().toISOString());
  }

  /** Exact staging keys owned by this live case: registry rows plus legacy `${live}__staging__<hex>` keys. No LIKE. */
  listOwnedStagingKeys(scope: CaseScope | string): string[] {
    const live = this.asScope(scope);
    const keys = new Set<string>();
    const registered = this.database.prepare(
      `SELECT staging_case_key AS k FROM case_staging_registry WHERE tenant_id = ? AND project_id = ? AND live_case_key = ?`,
    ).all(live.tenantId, live.projectId, live.caseKey) as Array<{ k: string }>;
    for (const row of registered) keys.add(row.k);
    for (const table of CASE_TABLES) {
      const rows = this.database.prepare(
        `SELECT DISTINCT case_key AS k FROM ${table} WHERE tenant_id = ? AND project_id = ?`,
      ).all(live.tenantId, live.projectId) as Array<{ k: string }>;
      for (const row of rows) {
        if (isLegacyStagingKeyForLive(row.k, live.caseKey)) keys.add(row.k);
      }
    }
    return [...keys];
  }

  /** Remove only this live case's staging partitions by exact case_key equality. */
  clearStagingKeys(scope: CaseScope | string): void {
    const live = this.asScope(scope);
    const run = () => {
      const keys = this.listOwnedStagingKeys(live);
      for (const stagingKey of keys) {
        this.clearCase({ ...live, caseKey: stagingKey });
      }
      this.database.prepare(
        `DELETE FROM case_staging_registry WHERE tenant_id = ? AND project_id = ? AND live_case_key = ?`,
      ).run(live.tenantId, live.projectId, live.caseKey);
    };
    if (this.txDepth > 0) run();
    else this.transaction(run);
  }

  danglingRelationships(scope: CaseScope | string): Array<{ relId: string; startId: string; endId: string }> {
    const rows = this.database.prepare(
      `SELECT rel_id AS relId, start_id AS startId, end_id AS endId
       FROM case_graph_relationships
       WHERE tenant_id = ? AND project_id = ? AND case_key = ?
         AND (
           NOT EXISTS (
             SELECT 1 FROM case_graph_nodes n
             WHERE n.tenant_id = case_graph_relationships.tenant_id
               AND n.project_id = case_graph_relationships.project_id
               AND n.case_key = case_graph_relationships.case_key
               AND n.node_id = case_graph_relationships.start_id
           )
           OR NOT EXISTS (
             SELECT 1 FROM case_graph_nodes n
             WHERE n.tenant_id = case_graph_relationships.tenant_id
               AND n.project_id = case_graph_relationships.project_id
               AND n.case_key = case_graph_relationships.case_key
               AND n.node_id = case_graph_relationships.end_id
           )
         )`,
    ).all(...this.params(scope)) as Array<{ relId: string; startId: string; endId: string }>;
    return rows;
  }

  instancesMissingBelong(scope: CaseScope | string): string[] {
    const rows = this.database.prepare(
      `SELECT n.node_id AS nodeId
       FROM case_graph_nodes n
       WHERE n.tenant_id = ? AND n.project_id = ? AND n.case_key = ?
         AND n.node_kind = 'GraphInstance'
         AND NOT EXISTS (
           SELECT 1 FROM case_graph_relationships r
           WHERE r.tenant_id = n.tenant_id AND r.project_id = n.project_id AND r.case_key = n.case_key
             AND r.rel_type = 'BELONG' AND r.start_id = n.node_id
         )`,
    ).all(...this.params(scope)) as Array<{ nodeId: string }>;
    return rows.map((row) => row.nodeId);
  }

  countNodes(scope: CaseScope | string): number {
    const row = this.database.prepare(
      `SELECT COUNT(*) AS n FROM case_graph_nodes WHERE tenant_id = ? AND project_id = ? AND case_key = ?`,
    ).get(...this.params(scope)) as { n: number };
    return Number(row.n);
  }

  countRelationships(scope: CaseScope | string): number {
    const row = this.database.prepare(
      `SELECT COUNT(*) AS n FROM case_graph_relationships WHERE tenant_id = ? AND project_id = ? AND case_key = ?`,
    ).get(...this.params(scope)) as { n: number };
    return Number(row.n);
  }

  insertNode(scope: CaseScope | string, row: {
    nodeId: string;
    labels: string[];
    nodeKind: string;
    graphId?: string | null;
    graphName?: string | null;
    graphDesc?: string | null;
    instanceId?: string | null;
    objId?: string | null;
    name?: string | null;
    deviceName?: string | null;
    equipCode?: string | null;
    shortCode?: string | null;
    componentName?: string | null;
    drawingMethod?: string | null;
    matrix?: string | null;
    boundingBox?: string | null;
    connectPoint?: string | null;
    points?: string | null;
    objSvg?: string | null;
    worldBBox?: { minX: number; minY: number; maxX: number; maxY: number } | null;
    propertiesJson: string;
  }): void {
    this.database.prepare(`
      INSERT INTO case_graph_nodes (
        tenant_id, project_id, case_key, node_id, labels_json, node_kind, graph_id, graph_name, graph_desc,
        instance_id, obj_id, name, device_name, equip_code, short_code, component_name,
        drawing_method, matrix, bounding_box, connect_point, points, obj_svg,
        world_min_x, world_min_y, world_max_x, world_max_y, properties_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...this.params(scope), row.nodeId, JSON.stringify(row.labels), row.nodeKind,
      row.graphId ?? null, row.graphName ?? null, row.graphDesc ?? null,
      row.instanceId ?? null, row.objId ?? null, row.name ?? null, row.deviceName ?? null,
      row.equipCode ?? null, row.shortCode ?? null, row.componentName ?? null,
      row.drawingMethod ?? null, row.matrix ?? null, row.boundingBox ?? null,
      row.connectPoint ?? null, row.points ?? null,
      row.objSvg === undefined || row.objSvg === null ? null : String(row.objSvg),
      row.worldBBox?.minX ?? null, row.worldBBox?.minY ?? null,
      row.worldBBox?.maxX ?? null, row.worldBBox?.maxY ?? null,
      row.propertiesJson,
    );
  }

  insertRelationship(scope: CaseScope | string, row: {
    relId: string;
    relType: string;
    startId: string;
    endId: string;
    connectType?: string | null;
    point?: string | null;
    fromJson?: string | null;
    toJson?: string | null;
    sId?: string | null;
    startGraphId?: string | null;
    endGraphId?: string | null;
    propertiesJson?: string | null;
    startSnapshotJson?: string | null;
    endSnapshotJson?: string | null;
  }): void {
    this.database.prepare(`
      INSERT INTO case_graph_relationships (
        tenant_id, project_id, case_key, rel_id, rel_type, start_id, end_id, connect_type, point, from_json, to_json, s_id,
        start_graph_id, end_graph_id, properties_json, start_snapshot_json, end_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...this.params(scope), row.relId, row.relType, row.startId, row.endId,
      row.connectType ?? null, row.point ?? null, row.fromJson ?? null, row.toJson ?? null, row.sId ?? null,
      row.startGraphId ?? null, row.endGraphId ?? null,
      row.propertiesJson ?? null, row.startSnapshotJson ?? null, row.endSnapshotJson ?? null,
    );
  }

  insertDocument(scope: CaseScope | string, row: Omit<CaseDocumentRecord, "id" | "caseKey">): void {
    this.database.prepare(`
      INSERT INTO case_documents (
        tenant_id, project_id, case_key, file_name, relative_path, role, byte_size, sha256, mime_type,
        parse_status, parse_tool, parse_note, extracted_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...this.params(scope), row.fileName, row.relativePath, row.role, row.byteSize, row.sha256,
      row.mimeType, row.parseStatus, row.parseTool, row.parseNote, row.extractedText,
    );
  }

  insertPoint(scope: CaseScope | string, pointType: string, name: string, fields: Record<string, string>): void {
    this.database.prepare(`
      INSERT INTO case_points (tenant_id, project_id, case_key, point_type, name, fields_json) VALUES (?, ?, ?, ?, ?, ?)
    `).run(...this.params(scope), pointType, name, JSON.stringify(fields));
  }

  insertSharedPipeRow(scope: CaseScope | string, row: Omit<SharedPipeRow, "id" | "caseKey">): void {
    this.database.prepare(`
      INSERT INTO case_shared_pipe_rows (
        tenant_id, project_id, case_key, group_label, equipment_code, system_name, logic_analysis, pms_impact, pls_impact, row_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...this.params(scope), row.groupLabel, row.equipmentCode, row.systemName,
      row.logicAnalysis, row.pmsImpact, row.plsImpact, row.rowIndex,
    );
  }

  saveReport(scope: CaseScope | string, report: CaseImportReport): void {
    this.database.prepare(`
      INSERT INTO case_imports (tenant_id, project_id, case_key, source_dir, started_at, finished_at, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(...this.params(scope), report.sourceDir, report.startedAt, report.finishedAt, JSON.stringify(report));
  }

  getReport(scope: CaseScope | string): CaseImportReport | null {
    const row = this.database.prepare(`SELECT report_json FROM case_imports WHERE tenant_id = ? AND project_id = ? AND case_key = ?`).get(...this.params(scope)) as { report_json: string } | undefined;
    return row ? JSON.parse(row.report_json) as CaseImportReport : null;
  }

  listPages(scope: CaseScope | string): GraphPage[] {
    const rows = this.database.prepare(`
      SELECT n.node_id AS nodeId, n.graph_id AS graphId, n.graph_name AS graphName, n.graph_desc AS graphDesc,
        (SELECT COUNT(*) FROM case_graph_nodes i
          WHERE i.tenant_id = n.tenant_id AND i.project_id = n.project_id AND i.case_key = n.case_key
            AND i.node_kind = 'GraphInstance' AND i.graph_id = n.graph_id) AS instanceCount
      FROM case_graph_nodes n
      WHERE n.tenant_id = ? AND n.project_id = ? AND n.case_key = ? AND n.node_kind = 'GraphInfo'
      ORDER BY n.graph_name
    `).all(...this.params(scope)) as Array<{ nodeId: string; graphId: string; graphName: string; graphDesc: string | null; instanceCount: number }>;
    return rows;
  }

  listPageElements(scope: CaseScope | string, graphName: string, options: {
    minX?: number; minY?: number; maxX?: number; maxY?: number; includeSvg?: boolean;
  } = {}): Array<GraphInstanceSummary & { objSvg?: string | null }> {
    const page = this.database.prepare(`
      SELECT graph_id FROM case_graph_nodes WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND node_kind = 'GraphInfo' AND graph_name = ?
    `).get(...this.params(scope), graphName) as { graph_id: string } | undefined;
    if (!page) return [];
    const rows = this.database.prepare(`
      SELECT node_id, labels_json, graph_id, graph_name, instance_id, obj_id, name, device_name, equip_code,
             short_code, component_name, drawing_method, matrix, bounding_box, connect_point, points,
             CASE WHEN obj_svg IS NOT NULL AND length(trim(obj_svg)) > 0 THEN 1 ELSE 0 END AS has_svg,
             world_min_x, world_min_y, world_max_x, world_max_y
             ${options.includeSvg ? ", obj_svg, properties_json" : ""}
      FROM case_graph_nodes
      WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND node_kind = 'GraphInstance' AND graph_id = ?
    `).all(...this.params(scope), page.graph_id) as Array<Record<string, unknown>>;

    const { minX, minY, maxX, maxY } = options;
    const out: Array<GraphInstanceSummary & { objSvg?: string | null }> = [];
    for (const row of rows) {
      const bbox = row.world_min_x == null ? null : {
        minX: Number(row.world_min_x), minY: Number(row.world_min_y),
        maxX: Number(row.world_max_x), maxY: Number(row.world_max_y),
      };
      if (bbox && minX != null && minY != null && maxX != null && maxY != null) {
        const disjoint = bbox.maxX < minX || bbox.minX > maxX || bbox.maxY < minY || bbox.minY > maxY;
        if (disjoint) continue;
      }
      const summary = summaryFromRow(row);
      if (options.includeSvg) {
        const raw = (row.obj_svg as string | null) ?? null;
        out.push({ ...summary, objSvg: raw && raw.trim() ? sanitizeSvg(raw) : raw });
      } else out.push(summary);
    }
    return out;
  }

  getInstance(scope: CaseScope | string, nodeId: string): GraphInstanceDetail | null {
    const row = this.database.prepare(`
      SELECT * FROM case_graph_nodes WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND node_id = ?
    `).get(...this.params(scope), nodeId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const raw = (row.obj_svg as string | null) ?? null;
    return {
      ...summaryFromRow(row),
      objSvg: raw && raw.trim() ? sanitizeSvg(raw) : raw,
      properties: JSON.parse(String(row.properties_json || "{}")) as Record<string, unknown>,
    };
  }

  getRelationshipsForNode(scope: CaseScope | string, nodeId: string): GraphRelationship[] {
    const rows = this.database.prepare(`
      SELECT * FROM case_graph_relationships
      WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND (start_id = ? OR end_id = ?)
    `).all(...this.params(scope), nodeId, nodeId) as Array<Record<string, unknown>>;
    return rows.map(relationshipFromRow);
  }

  allConnects(scope: CaseScope | string): GraphRelationship[] {
    const rows = this.database.prepare(`
      SELECT * FROM case_graph_relationships WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND rel_type = 'CONNECTS'
    `).all(...this.params(scope)) as Array<Record<string, unknown>>;
    return rows.map(relationshipFromRow);
  }

  findInstruments(scope: CaseScope | string, query: string): GraphInstanceSummary[] {
    const needle = `%${query}%`;
    const rows = this.database.prepare(`
      SELECT node_id, labels_json, graph_id, graph_name, instance_id, obj_id, name, device_name, equip_code,
             short_code, component_name, drawing_method, matrix, bounding_box, connect_point, points,
             CASE WHEN obj_svg IS NOT NULL AND length(trim(obj_svg)) > 0 THEN 1 ELSE 0 END AS has_svg,
             world_min_x, world_min_y, world_max_x, world_max_y
      FROM case_graph_nodes
      WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND node_kind = 'GraphInstance' AND (
        short_code LIKE ? OR equip_code LIKE ? OR device_name LIKE ? OR name LIKE ? OR replace(device_name, char(10), '') LIKE ?
      )
    `).all(...this.params(scope), needle, needle, needle, needle, needle) as Array<Record<string, unknown>>;
    return rows.map(summaryFromRow);
  }

  allInstances(scope: CaseScope | string): GraphInstanceSummary[] {
    const rows = this.database.prepare(`
      SELECT node_id, labels_json, graph_id, graph_name, instance_id, obj_id, name, device_name, equip_code,
             short_code, component_name, drawing_method, matrix, bounding_box, connect_point, points,
             CASE WHEN obj_svg IS NOT NULL AND length(trim(obj_svg)) > 0 THEN 1 ELSE 0 END AS has_svg,
             world_min_x, world_min_y, world_max_x, world_max_y
      FROM case_graph_nodes WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND node_kind = 'GraphInstance'
    `).all(...this.params(scope)) as Array<Record<string, unknown>>;
    return rows.map(summaryFromRow);
  }

  countEmptyObjSvg(scope: CaseScope | string): number {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS n FROM case_graph_nodes
      WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND node_kind = 'GraphInstance'
        AND (obj_svg IS NULL OR length(trim(obj_svg)) = 0)
    `).get(...this.params(scope)) as { n: number };
    return Number(row.n);
  }

  listSourceWarnings(scope: CaseScope | string): string[] {
    const rows = this.database.prepare(`
      SELECT node_id, name, device_name, short_code, graph_name FROM case_graph_nodes
      WHERE tenant_id = ? AND project_id = ? AND case_key = ? AND node_kind = 'GraphInstance'
        AND (
          (device_name LIKE '%TE%' AND device_name LIKE '%125C%' AND (short_code IS NULL OR short_code = ''))
          OR (device_name LIKE '%ZT%' AND device_name LIKE '%334X%' AND (short_code IS NULL OR short_code = ''))
          OR ((name LIKE '%TE125C%' OR name LIKE '%ZT334X%') AND (short_code IS NULL OR short_code = ''))
        )
    `).all(...this.params(scope)) as Array<{ node_id: string; name: string | null; device_name: string | null; short_code: string | null; graph_name: string | null }>;
    return rows.map((row) => {
      const label = (row.device_name ?? row.name ?? row.node_id).replace(/\s+/g, "");
      return `源数据缺少短位号：节点 ${row.node_id}（${label}，图页 ${row.graph_name ?? "?"}）的 shortCode 为空，按位号搜索可能找不到。`;
    });
  }

  listDocuments(scope: CaseScope | string): CaseDocumentRecord[] {
    const rows = this.database.prepare(`SELECT * FROM case_documents WHERE tenant_id = ? AND project_id = ? AND case_key = ? ORDER BY id`).all(...this.params(scope)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      caseKey: String(row.case_key),
      fileName: String(row.file_name),
      relativePath: String(row.relative_path),
      role: String(row.role),
      byteSize: Number(row.byte_size),
      sha256: (row.sha256 as string | null) ?? null,
      mimeType: String(row.mime_type),
      parseStatus: row.parse_status as ParseStatus,
      parseTool: (row.parse_tool as string | null) ?? null,
      parseNote: (row.parse_note as string | null) ?? null,
      extractedText: (row.extracted_text as string | null) ?? null,
    }));
  }

  listPoints(scope: CaseScope | string): PointRecord[] {
    const rows = this.database.prepare(`SELECT * FROM case_points WHERE tenant_id = ? AND project_id = ? AND case_key = ? ORDER BY id`).all(...this.params(scope)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      caseKey: String(row.case_key),
      pointType: String(row.point_type),
      name: String(row.name),
      fields: JSON.parse(String(row.fields_json || "{}")) as Record<string, string>,
    }));
  }

  listSharedPipeRows(scope: CaseScope | string): SharedPipeRow[] {
    const rows = this.database.prepare(`SELECT * FROM case_shared_pipe_rows WHERE tenant_id = ? AND project_id = ? AND case_key = ? ORDER BY row_index`).all(...this.params(scope)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      caseKey: String(row.case_key),
      groupLabel: (row.group_label as string | null) ?? null,
      equipmentCode: String(row.equipment_code),
      systemName: (row.system_name as string | null) ?? null,
      logicAnalysis: (row.logic_analysis as string | null) ?? null,
      pmsImpact: (row.pms_impact as string | null) ?? null,
      plsImpact: (row.pls_impact as string | null) ?? null,
      rowIndex: Number(row.row_index),
    }));
  }

  pageSvgPayload(scope: CaseScope | string, graphName: string, viewport?: { minX?: number; minY?: number; maxX?: number; maxY?: number }): Array<GraphInstanceSummary & { objSvg: string | null }> {
    return this.listPageElements(scope, graphName, { ...viewport, includeSvg: true }) as Array<GraphInstanceSummary & { objSvg: string | null }>;
  }

  backfillGraphNames(scope: CaseScope | string): void {
    this.database.prepare(`
      UPDATE case_graph_nodes AS inst
      SET graph_name = (
        SELECT page.graph_name FROM case_graph_nodes page
        WHERE page.tenant_id = inst.tenant_id AND page.project_id = inst.project_id AND page.case_key = inst.case_key
          AND page.node_kind = 'GraphInfo' AND page.graph_id = inst.graph_id
      ),
      graph_desc = (
        SELECT page.graph_desc FROM case_graph_nodes page
        WHERE page.tenant_id = inst.tenant_id AND page.project_id = inst.project_id AND page.case_key = inst.case_key
          AND page.node_kind = 'GraphInfo' AND page.graph_id = inst.graph_id
      )
      WHERE inst.tenant_id = ? AND inst.project_id = ? AND inst.case_key = ?
        AND inst.node_kind = 'GraphInstance' AND inst.graph_name IS NULL AND inst.graph_id IS NOT NULL
    `).run(...this.params(scope));
  }
}

function parseJson(value: unknown): unknown {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function summaryFromRow(row: Record<string, unknown>): GraphInstanceSummary {
  return {
    nodeId: String(row.node_id),
    labels: JSON.parse(String(row.labels_json || "[]")) as string[],
    graphId: (row.graph_id as string | null) ?? null,
    graphName: (row.graph_name as string | null) ?? null,
    instanceId: (row.instance_id as string | null) ?? null,
    objId: (row.obj_id as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    deviceName: (row.device_name as string | null) ?? null,
    equipCode: (row.equip_code as string | null) ?? null,
    shortCode: (row.short_code as string | null) ?? null,
    componentName: (row.component_name as string | null) ?? null,
    drawingMethod: (row.drawing_method as string | null) ?? null,
    matrix: (row.matrix as string | null) ?? null,
    boundingBox: parseJson(row.bounding_box),
    connectPoint: parseJson(row.connect_point),
    points: parseJson(row.points),
    hasSvg: Boolean(row.has_svg) || Boolean(row.obj_svg && String(row.obj_svg).trim()),
    worldBBox: row.world_min_x == null ? null : {
      minX: Number(row.world_min_x), minY: Number(row.world_min_y),
      maxX: Number(row.world_max_x), maxY: Number(row.world_max_y),
    },
  };
}

function relationshipFromRow(row: Record<string, unknown>): GraphRelationship {
  return {
    relId: String(row.rel_id),
    relType: String(row.rel_type),
    startId: String(row.start_id),
    endId: String(row.end_id),
    connectType: (row.connect_type as string | null) ?? null,
    point: (row.point as string | null) ?? null,
    fromJson: (row.from_json as string | null) ?? null,
    toJson: (row.to_json as string | null) ?? null,
    sId: (row.s_id as string | null) ?? null,
    startGraphId: (row.start_graph_id as string | null) ?? null,
    endGraphId: (row.end_graph_id as string | null) ?? null,
    properties: row.properties_json ? JSON.parse(String(row.properties_json)) as Record<string, unknown> : null,
  };
}
