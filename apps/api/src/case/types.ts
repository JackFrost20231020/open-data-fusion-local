export const DEFAULT_CASE_KEY = "demo";

export interface CaseScope {
  tenantId: string;
  projectId: string;
  caseKey: string;
}

export const DEFAULT_CASE_SCOPE: Pick<CaseScope, "tenantId" | "projectId"> = {
  tenantId: "demo",
  projectId: "north-plant",
};

export function caseScope(caseKey: string, tenantId = DEFAULT_CASE_SCOPE.tenantId, projectId = DEFAULT_CASE_SCOPE.projectId): CaseScope {
  return { tenantId, projectId, caseKey };
}

/** Optional source-declared census. Never inferred from a private package. */
export type ExpectedCounts = {
  pages?: number;
  nodes?: number;
  graphInfo?: number;
  graphInstance?: number;
  pipeSegments?: number;
  relationships?: number;
  belong?: number;
  connects?: number;
};

export interface GraphImportIntegrity {
  skippedLines: number;
  danglingRelationships: number;
  instancesMissingBelong: number;
  complete: boolean;
  notes: string[];
}

export type ParseStatus = "imported" | "parsed" | "attached_only" | "unsupported" | "ok" | "failed" | "skipped";

export interface CaseDocumentRecord {
  id: number;
  caseKey: string;
  fileName: string;
  relativePath: string;
  role: string;
  byteSize: number;
  sha256: string | null;
  mimeType: string;
  parseStatus: ParseStatus;
  parseTool: string | null;
  parseNote: string | null;
  extractedText: string | null;
}

export interface ImportSkip {
  line: number;
  reason: string;
}

export interface PageCount {
  graphName: string;
  graphId: string;
  instances: number;
}

export interface CaseImportReport {
  caseKey: string;
  sourceDir: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  peakHeapBytes: number;
  expected: ExpectedCounts | null;
  integrity: GraphImportIntegrity;
  nodes: { total: number; graphInfo: number; graphInstance: number; pipeSegments: number };
  relationships: { total: number; belong: number; connects: number; connectsCrossPage: number };
  pages: PageCount[];
  skipped: ImportSkip[];
  documents: Array<Pick<CaseDocumentRecord, "fileName" | "parseStatus" | "parseTool" | "parseNote" | "byteSize">>;
  pointsParsed: number;
  sharedPipeRowsParsed: number;
  replacedPreviousImport: boolean;
  notes: string[];
  emptyObjSvg?: number;
  sanitizedSvgCount?: number;
  tenantId?: string;
  projectId?: string;
}

export interface GraphPage {
  nodeId: string;
  graphId: string;
  graphName: string;
  graphDesc: string | null;
  instanceCount: number;
}

export interface GraphInstanceSummary {
  nodeId: string;
  labels: string[];
  graphId: string | null;
  graphName: string | null;
  instanceId: string | null;
  objId: string | null;
  name: string | null;
  deviceName: string | null;
  equipCode: string | null;
  shortCode: string | null;
  componentName: string | null;
  drawingMethod: string | null;
  matrix: string | null;
  boundingBox: unknown;
  connectPoint: unknown;
  points: unknown;
  hasSvg: boolean;
  worldBBox: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

export interface GraphInstanceDetail extends GraphInstanceSummary {
  objSvg: string | null;
  properties: Record<string, unknown>;
}

export interface GraphRelationship {
  relId: string;
  relType: string;
  startId: string;
  endId: string;
  connectType: string | null;
  point: string | null;
  fromJson: string | null;
  toJson: string | null;
  sId: string | null;
  startGraphId: string | null;
  endGraphId: string | null;
  properties: Record<string, unknown> | null;
}

export interface PointRecord {
  id: number;
  caseKey: string;
  pointType: string;
  name: string;
  fields: Record<string, string>;
}

export interface SharedPipeRow {
  id: number;
  caseKey: string;
  groupLabel: string | null;
  equipmentCode: string;
  systemName: string | null;
  logicAnalysis: string | null;
  pmsImpact: string | null;
  plsImpact: string | null;
  rowIndex: number;
}

export type AnalysisSource = "graph" | "point_table" | "xlsx" | "risk_doc" | "task_text" | "pms_pdf";

export interface SourceRef {
  fileName: string;
  page?: string | null;
  locator?: string | null;
  confidence?: "high" | "medium" | "low";
  source: AnalysisSource;
}

export interface SharedPipeOptions {
  hopLimit?: number;
  traverseInstruments?: boolean;
}

export interface PathStep {
  nodeId: string;
  name: string | null;
  role?: string | null;
}


export interface AnalysisInstrument {
  tag: string;
  unitPrefix?: string | null;
  nodeId?: string | null;
  shortCode?: string | null;
  equipCode?: string | null;
  deviceName?: string | null;
  name?: string | null;
  page?: string | null;
  hops?: number;
  sources: AnalysisSource[];
  notes?: string[];
  path?: PathStep[];
  reachedThroughInstrument?: boolean;
  sourceRefs?: SourceRef[];
  conflicts?: string[];
}

export interface CaseAnalysis {
  queriedTag: string;
  found: boolean;
  notFoundReason?: string;
  aliasesPreserved: { taskTag: string; packageTag: string; note: string };
  targetInstruments: AnalysisInstrument[];
  sourceWarnings?: string[];
  singleChannel: {
    summary: string;
    impacts: Array<{ source: AnalysisSource; text: string }>;
    needsEngineeringConfirmation: boolean;
  };
  sharedPipe: {
    method: string;
    derivedFromGraph: AnalysisInstrument[];
    listedInXlsx: AnalysisInstrument[];
    reachedThroughInstrument?: AnalysisInstrument[];
    agreement: string[];
    disagreement: string[];
    needsEngineeringConfirmation: boolean;
    options?: { hopLimit: number; traverseInstruments: boolean };
  };
  sharedCard: {
    method: string;
    fromPointTable: AnalysisInstrument[];
    fromRiskDoc: AnalysisInstrument[];
    fromPmsPdf?: AnalysisInstrument[];
    conflicts?: Array<{ tag: string; sources: string[]; detail: string }>;
    excludedByDoc: string[];
    cardHint: string | null;
    needsEngineeringConfirmation: boolean;
  };
  evidenceDocuments: Array<{ fileName: string; parseStatus: ParseStatus }>;
}
