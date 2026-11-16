import type { CaseStore } from "./store.js";
import {
  collectPmsCards,
  coreInstrumentTag,
  normalizeInstrumentTag,
  parsePointTableCards,
  parseRiskDocCards,
  sameCardKey,
  type CardChannel,
} from "./parse-cards.js";
import type {
  AnalysisInstrument,
  AnalysisSource,
  CaseAnalysis,
  CaseScope,
  GraphInstanceSummary,
  GraphRelationship,
  PathStep,
  SharedPipeOptions,
  SourceRef,
} from "./types.js";

const INSTRUMENT_RE = /(?:^|-)((?:PT|LT|TE|FT|PY)\d+[A-Z]?)$/i;
const TAG_TOKEN_RE = /\b[A-Z]{2,}-[A-Z]{0,6}\d+[A-Z]?\b|(?:^|\s)((?:PT|LT|TE|FT|PY)\d+[A-Z]?)(?=\s|$)/gi;

function tagsInText(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(TAG_TOKEN_RE)) {
    const raw = (match[0] ?? "").trim().replace(/^[^A-Z]+/, "");
    if (!raw) continue;
    const key = coreInstrumentTag(raw.toUpperCase());
    if (!key || seen.has(key)) continue;
    seen.add(key);
    found.push(raw.toUpperCase());
  }
  return found;
}

function resolveAliases(query: string, taskText: string | null | undefined): { taskTag: string; packageTag: string; note: string } {
  const queryCore = coreInstrumentTag(query);
  const mentioned = tagsInText(taskText);
  const other = mentioned.find((tag) => coreInstrumentTag(tag) !== queryCore) ?? query;
  const same = coreInstrumentTag(other) === queryCore;
  if (same) {
    return {
      taskTag: query,
      packageTag: query,
      note: mentioned.length ? `任务说明与查询均指向 ${query}。` : `未在任务说明中发现与 ${query} 不同的位号别名。`,
    };
  }
  return {
    taskTag: other,
    packageTag: query,
    note: `任务说明提到 ${other}，本次查询使用 ${query}。两者按原样保留，未改名或合并。`,
  };
}
const VESSEL_RE = /稳压器|压力容器|容器|steam generator|pressurizer|reactor vessel/i;

function normalizeTag(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function coreTag(value: string | null | undefined): string {
  return coreInstrumentTag(value ?? "");
}

function looksLikeInstrument(item: GraphInstanceSummary): boolean {
  const blob = [item.shortCode, item.equipCode, item.deviceName, item.name].filter(Boolean).join(" ");
  if (!INSTRUMENT_RE.test(blob) && !/(?:PT|LT|TE|FT)\d+/i.test(blob)) return false;
  if (/柔性管|稳压器/.test(item.componentName ?? "") || /柔性管|稳压器/.test(item.name ?? "")) return false;
  return true;
}

function isPipelineTraversable(item: GraphInstanceSummary): boolean {
  const method = item.drawingMethod ?? "";
  if (method === "PIPE_SEGMENT" || method === "PIPE_VALVE_COMPONENT" || method === "CONNECT_SYMBOL") return true;
  if (item.labels.includes("DrawPipeSegment")) return true;
  const name = `${item.name ?? ""} ${item.componentName ?? ""}`;
  if (/跳转|柔性管/.test(name)) return true;
  return false;
}

function isVessel(item: GraphInstanceSummary): boolean {
  return VESSEL_RE.test(`${item.name ?? ""} ${item.componentName ?? ""} ${item.shortCode ?? ""}`);
}

function nodeLabel(item: GraphInstanceSummary): string {
  const pretty = item.shortCode || item.equipCode || item.deviceName;
  if (pretty) return pretty;
  if (item.componentName && !/^\d+$/.test(item.componentName)) return item.componentName;
  if (item.name && !/^\d+$/.test(item.name) && item.name !== item.nodeId) return item.name;
  if (item.name && item.name !== item.nodeId) return `${item.nodeId}（${item.name}）`;
  return item.nodeId;
}

function roleOf(item: GraphInstanceSummary): string {
  if (looksLikeInstrument(item)) return "instrument";
  if (item.drawingMethod === "PIPE_VALVE_COMPONENT" || /阀/.test(`${item.name ?? ""}${item.componentName ?? ""}`)) return "valve";
  if (item.labels.includes("DrawPipeSegment") || item.drawingMethod === "PIPE_SEGMENT") return "segment";
  if (item.drawingMethod === "CONNECT_SYMBOL" || /跳转/.test(`${item.name ?? ""}${item.componentName ?? ""}`)) return "jump";
  return "node";
}

function toInstrument(item: GraphInstanceSummary, sources: AnalysisSource[], hops?: number, extra: Partial<AnalysisInstrument> = {}): AnalysisInstrument {
  return {
    tag: item.shortCode || item.equipCode || item.deviceName || item.name || item.nodeId,
    unitPrefix: item.shortCode?.match(/^(\d)-/)?.[1] ?? null,
    nodeId: item.nodeId,
    shortCode: item.shortCode,
    equipCode: item.equipCode,
    deviceName: item.deviceName,
    name: item.name,
    page: item.graphName,
    hops,
    sources,
    ...extra,
  };
}

export function matchesQuery(item: GraphInstanceSummary, query: string): boolean {
  const q = normalizeTag(query);
  const core = coreTag(query);
  const fields = [item.shortCode, item.equipCode, item.deviceName, item.name].map(normalizeTag);
  return fields.some((field) => field === q || field.endsWith(q) || field.includes(q) || (core && coreTag(field) === core));
}

function buildAdjacency(rels: GraphRelationship[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const push = (from: string, to: string) => {
    const list = adj.get(from);
    if (list) list.push(to);
    else adj.set(from, [to]);
  };
  for (const rel of rels) {
    if (rel.relType !== "CONNECTS") continue;
    push(rel.startId, rel.endId);
    push(rel.endId, rel.startId);
  }
  return adj;
}

function reconstructPath(parent: Map<string, string>, startIds: Set<string>, endId: string, instances: Map<string, GraphInstanceSummary>): PathStep[] {
  const ids: string[] = [];
  let current: string | undefined = endId;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    ids.push(current);
    if (startIds.has(current)) break;
    current = parent.get(current);
  }
  ids.reverse();
  return ids.map((id) => {
    const node = instances.get(id);
    return { nodeId: id, name: node ? nodeLabel(node) : id, role: node ? roleOf(node) : null };
  });
}

export function traverseSharedPipe(
  startIds: string[],
  instances: Map<string, GraphInstanceSummary>,
  adj: Map<string, string[]>,
  hopLimitOrOptions: number | SharedPipeOptions = 16,
): { derived: AnalysisInstrument[]; pathIds: string[]; throughInstrument: AnalysisInstrument[] } {
  const options: SharedPipeOptions = typeof hopLimitOrOptions === "number"
    ? { hopLimit: hopLimitOrOptions, traverseInstruments: false }
    : { hopLimit: 16, traverseInstruments: false, ...hopLimitOrOptions };
  const hopLimit = options.hopLimit ?? 16;
  const traverseInstruments = Boolean(options.traverseInstruments);
  const starts = new Set(startIds);
  const seen = new Set(startIds);
  const queue: Array<{ id: string; hops: number; throughInstrument: boolean }> = startIds.map((id) => ({ id, hops: 0, throughInstrument: false }));
  const derived: AnalysisInstrument[] = [];
  const throughInstrument: AnalysisInstrument[] = [];
  const pathIds = new Set(startIds);
  const parent = new Map<string, string>();

  while (queue.length) {
    const current = queue.shift()!;
    if (current.hops >= hopLimit) continue;
    for (const nextId of adj.get(current.id) ?? []) {
      if (seen.has(nextId)) continue;
      seen.add(nextId);
      const node = instances.get(nextId);
      if (!node) continue;
      pathIds.add(nextId);
      parent.set(nextId, current.id);
      if (isVessel(node)) continue;
      const path = reconstructPath(parent, starts, nextId, instances);
      if (looksLikeInstrument(node) && !starts.has(nextId)) {
        const instrument = toInstrument(node, ["graph"], current.hops + 1, {
          path,
          reachedThroughInstrument: current.throughInstrument,
        });
        if (current.throughInstrument) throughInstrument.push(instrument);
        else derived.push(instrument);
        if (traverseInstruments) {
          queue.push({ id: nextId, hops: current.hops + 1, throughInstrument: true });
        }
        continue;
      }
      if (isPipelineTraversable(node) || traverseInstruments) {
        queue.push({ id: nextId, hops: current.hops + 1, throughInstrument: current.throughInstrument });
      }
    }
  }
  return { derived, pathIds: [...pathIds], throughInstrument };
}

function channelToInstrument(row: CardChannel): AnalysisInstrument {
  const ref: SourceRef = {
    fileName: row.fileName,
    page: row.page,
    locator: row.locator,
    confidence: row.confidence,
    source: row.source,
  };
  return {
    tag: row.tag,
    sources: [row.source],
    notes: row.notes,
    sourceRefs: [ref],
  };
}

export function analyzeCase(
  store: CaseStore,
  caseKey: CaseScope | string,
  query: string,
  pipeOptions: SharedPipeOptions = {},
): CaseAnalysis & { pathIds: string[] } {
  if (!query?.trim()) {
    return {
      queriedTag: "",
      found: false,
      notFoundReason: "未提供查询位号",
      aliasesPreserved: { taskTag: "", packageTag: "", note: "请提供要分析的仪表位号。" },
      targetInstruments: [],
      singleChannel: { summary: "未提供查询位号，无法给出结论。", impacts: [], needsEngineeringConfirmation: true },
      sharedPipe: { method: "未提供查询位号，未执行图谱遍历。", derivedFromGraph: [], listedInXlsx: [], reachedThroughInstrument: [], agreement: [], disagreement: [], needsEngineeringConfirmation: true, options: { hopLimit: pipeOptions.hopLimit ?? 16, traverseInstruments: pipeOptions.traverseInstruments ?? false } },
      sharedCard: { method: "未提供查询位号，未归组同卡件。", fromPointTable: [], fromRiskDoc: [], conflicts: [], excludedByDoc: [], cardHint: null, needsEngineeringConfirmation: true },
      evidenceDocuments: [],
      pathIds: [],
    };
  }

  const hopLimit = pipeOptions.hopLimit ?? 16;
  const traverseInstruments = pipeOptions.traverseInstruments ?? false;
  const instances = new Map(store.allInstances(caseKey).map((item) => [item.nodeId, item]));
  const adj = buildAdjacency(store.allConnects(caseKey));
  const points = store.listPoints(caseKey);
  const xlsxRows = store.listSharedPipeRows(caseKey);
  const documents = store.listDocuments(caseKey);
  const sourceWarnings = typeof store.listSourceWarnings === "function" ? store.listSourceWarnings(caseKey) : [];
  const byRole = (role: string, namePat: RegExp) => documents.find((doc) => ("role" in doc && (doc as { role?: string }).role === role) || namePat.test(doc.fileName));
  const riskDoc = byRole("risk-doc", /risk\.doc/i);
  const taskDoc = byRole("task-note", /task\.txt|readme\.txt|说明\.txt/i);
  const pmsDoc = byRole("pms-pdf", /pms\.pdf/i);
  const pointDoc = byRole("point-table", /points\.xml|point-table\.xml|\.xml$/i);

  const targets = [...instances.values()].filter((item) => matchesQuery(item, query)).map((item) => toInstrument(item, ["graph"]));
  const found = targets.length > 0
    || xlsxRows.some((row) => coreTag(row.equipmentCode) === coreTag(query))
    || points.some((point) => coreTag(point.name) === coreTag(query) || normalizeTag(point.name).includes(normalizeTag(query)));

  // A query is "found in graph or structured data" only if the exact core tag appears.
  const foundInData = targets.length > 0
    || xlsxRows.some((row) => coreTag(row.equipmentCode) === coreTag(query))
    || points.some((point) => coreTag(point.name) === coreTag(query));

  const startIds = targets.map((item) => item.nodeId).filter((id): id is string => Boolean(id));

  // Always compute the no-body traversal and the through-instrument traversal so results can show both.
  const withoutBody = traverseSharedPipe(startIds, instances, adj, { hopLimit, traverseInstruments: false });
  const withBody = traverseSharedPipe(startIds, instances, adj, { hopLimit, traverseInstruments: true });
  const throughOnly = withBody.derived.filter((item) => item.reachedThroughInstrument)
    .concat(withBody.throughInstrument)
    .filter((item, index, list) => list.findIndex((row) => row.nodeId === item.nodeId) === index)
    .filter((item) => !withoutBody.derived.some((row) => row.nodeId === item.nodeId));

  const derived = traverseInstruments ? withBody.derived.concat(withBody.throughInstrument) : withoutBody.derived;
  const pathIds = traverseInstruments ? withBody.pathIds : withoutBody.pathIds;

  for (const item of derived) {
    // notes about xlsx membership are added after the spreadsheet cores are known
  }

  const xlsxInstruments: AnalysisInstrument[] = xlsxRows.map((row) => ({
    tag: row.equipmentCode,
    sources: ["xlsx"] as AnalysisSource[],
    sourceRefs: [{ source: "xlsx", fileName: documents.find((doc) => /xlsx/i.test(doc.fileName))?.fileName ?? "shared-pipe.xlsx", locator: `row ${row.rowIndex}`, confidence: "high" }],
    notes: [
      row.logicAnalysis ? `逻辑分析：${row.logicAnalysis}` : "",
      row.pmsImpact ? `PMS：${row.pmsImpact}` : "",
      row.plsImpact ? `PLS：${row.plsImpact}` : "",
    ].filter(Boolean),
  }));

  const derivedCores = new Set(derived.map((item) => coreTag(item.shortCode || item.tag)));
  const queryIsXlsxSubject = xlsxInstruments.some((item) => coreTag(item.tag) === coreTag(query));
  const xlsxCores = new Set(xlsxInstruments.map((item) => coreTag(item.tag)).filter((tag) => coreTag(tag) !== coreTag(query)));
  const agreement: string[] = [];
  const disagreement: string[] = [];
  if (queryIsXlsxSubject) {
    for (const core of xlsxCores) {
      if (derivedCores.has(core)) agreement.push(core);
      else if (throughOnly.some((item) => coreTag(item.shortCode || item.tag) === core)) {
        disagreement.push(`xlsx 列出 ${core}，仅在“穿越仪表本体”时由图谱到达`);
      } else disagreement.push(`xlsx 列出 ${core}，图谱遍历未找到`);
    }
    for (const core of derivedCores) {
      if (!xlsxCores.has(core)) {
        disagreement.push(`图谱遍历找到 ${core}，xlsx 共管表未列出（需工程确认）`);
      }
    }
  } else {
    for (const item of derived) {
      const core = coreTag(item.shortCode || item.tag);
      if (!xlsxCores.has(core) && core !== coreTag(query)) {
        disagreement.push(`图谱遍历找到 ${core}，xlsx 共管表未列出（需工程确认）`);
      }
    }
  }
  for (const item of derived) {
    const core = coreTag(item.shortCode || item.tag);
    if (!xlsxCores.has(core) && core !== coreTag(query)) {
      const note = "需工程确认是否计入共管：xlsx 共管表未列出该位号。";
      if (!item.notes?.includes(note)) item.notes = [...(item.notes ?? []), note];
    }
  }

  const emptyAnalysis = (reason: string): CaseAnalysis & { pathIds: string[] } => ({
    queriedTag: query,
    found: false,
    notFoundReason: reason,
    aliasesPreserved: resolveAliases(query, taskDoc?.extractedText),
    targetInstruments: [],
    sourceWarnings,
    singleChannel: {
      summary: "数据中未找到该位号，无法给出结论。",
      impacts: [],
      needsEngineeringConfirmation: true,
    },
    sharedPipe: {
      method: "未找到起始节点，未执行图谱遍历。",
      derivedFromGraph: [],
      listedInXlsx: xlsxInstruments.filter((item) => coreTag(item.tag) === coreTag(query)),
      reachedThroughInstrument: [],
      agreement: [],
      disagreement: [],
      needsEngineeringConfirmation: true,
      options: { hopLimit, traverseInstruments },
    },
    sharedCard: {
      method: "未找到该位号，未归组同卡件。",
      fromPointTable: [],
      fromRiskDoc: [],
      fromPmsPdf: [],
      conflicts: [],
      excludedByDoc: [],
      cardHint: null,
      needsEngineeringConfirmation: true,
    },
    evidenceDocuments: documents.map((doc) => ({ fileName: doc.fileName, parseStatus: doc.parseStatus })),
    pathIds: [],
  });

  if (instances.size === 0) {
    return emptyAnalysis("图谱中没有节点，无法据此给出结论。");
  }
  if (!foundInData) {
    return emptyAnalysis(`数据中未找到位号 ${query}`);
  }

  const xlsxTarget = xlsxRows.find((row) => coreTag(row.equipmentCode) === coreTag(query));
  const impacts: CaseAnalysis["singleChannel"]["impacts"] = [];
  if (xlsxTarget) {
    if (xlsxTarget.logicAnalysis) impacts.push({ source: "xlsx", text: xlsxTarget.logicAnalysis });
    if (xlsxTarget.pmsImpact) impacts.push({ source: "xlsx", text: `PMS侧：${xlsxTarget.pmsImpact}` });
    if (xlsxTarget.plsImpact) impacts.push({ source: "xlsx", text: `PLS侧：${xlsxTarget.plsImpact}` });
  }
  if (riskDoc?.extractedText) {
    const core = coreTag(query);
    const line = riskDoc.extractedText.split(/\n/).find((row) => core && normalizeTag(row).includes(core));
    if (line) impacts.push({ source: "risk_doc", text: line.trim() });
  }
  if (taskDoc?.extractedText && tagsInText(taskDoc.extractedText).some((tag) => coreTag(tag) === coreTag(query))) {
    impacts.push({ source: "task_text", text: taskDoc.extractedText.trim() });
  }

  const pmsRows = pmsDoc?.extractedText ? collectPmsCards(pmsDoc.extractedText, pmsDoc.fileName) : [];
  const riskParsed = parseRiskDocCards(riskDoc?.extractedText ?? "", riskDoc?.fileName ?? "risk.doc");
  const pointRows = parsePointTableCards(points, pointDoc?.fileName ?? "point-table.xml");

  const peersFor = (rows: CardChannel[], source: CardChannel["source"]): AnalysisInstrument[] => {
    const queryRows = rows.filter((row) => coreTag(row.tag) === coreTag(query));
    if (!queryRows.length) return [];
    const keys = new Set(queryRows.map((row) => sameCardKey(row)).filter((key): key is string => Boolean(key)));
    const peers = rows.filter((row) => {
      if (row.source !== source) return false;
      if (coreTag(row.tag) === coreTag(query)) return false;
      const key = sameCardKey(row);
      return Boolean(key && keys.has(key));
    });
    const unique = new Map<string, AnalysisInstrument>();
    for (const row of peers) {
      const key = normalizeInstrumentTag(row.tag);
      if (!unique.has(key)) unique.set(key, channelToInstrument(row));
    }
    return [...unique.values()];
  };

  const fromPmsPdf = peersFor(pmsRows, "pms_pdf");
  const fromRiskDoc = peersFor(riskParsed.listed, "risk_doc");
  // Risk doc lists peers of the subject instrument even if the subject itself is not in the regex hits.
  const riskPeers = fromRiskDoc.length
    ? fromRiskDoc
    : (riskParsed.listed.some((row) => coreTag(row.tag) === coreTag(query))
      ? riskParsed.listed
          .filter((row) => coreTag(row.tag) !== coreTag(query))
          .map(channelToInstrument)
      : []);
  const fromPointTable = peersFor(pointRows, "point_table");

  const pmsCores = new Set(fromPmsPdf.map((item) => coreTag(item.tag)));
  const riskCores = new Set(riskPeers.map((item) => coreTag(item.tag)));
  const conflicts: Array<{ tag: string; sources: string[]; detail: string }> = [];
  for (const core of new Set([...pmsCores, ...riskCores])) {
    const inPms = pmsCores.has(core);
    const inRisk = riskCores.has(core);
    if (inPms !== inRisk && (inPms || inRisk)) {
      // Only a conflict if both sources talk about this tag relative to the query.
      if (inRisk && !inPms) {
        const pmsMentions = pmsRows.some((row) => coreTag(row.tag) === core);
        if (pmsMentions) {
          const pmsRow = pmsRows.find((row) => coreTag(row.tag) === core);
          const queryRow = pmsRows.find((row) => coreTag(row.tag) === coreTag(query));
          conflicts.push({
            tag: core,
            sources: ["risk_doc", "pms_pdf"],
            detail: `风险分析文档将 ${core} 列为与 ${query} 同卡，但 PMS（《${pmsRow?.fileName ?? "pms.pdf"}》${pmsRow?.page ? `第 ${pmsRow.page} 页` : ""}）中 ${core} 在 ${pmsRow?.locator ?? "不同卡件"}，而 ${query} 在 ${queryRow?.locator ?? "其他卡件"}。未合并结论。`,
          });
        }
      }
    }
  }

  return {
    queriedTag: query,
    found: true,
    aliasesPreserved: resolveAliases(query, taskDoc?.extractedText),
    targetInstruments: targets,
    sourceWarnings,
    singleChannel: {
      summary: impacts.length
        ? "单通道故障影响主要来自已导入的共管表与风险分析文档，尚未经现场物理验证。"
        : "未在已解析资料中找到单通道故障影响描述。",
      impacts,
      needsEngineeringConfirmation: true,
    },
    sharedPipe: {
      method: "默认沿 CONNECTS 遍历管道段、阀门、跳转符和柔性管，在容器处停止，不穿越其他仪表本体；并与已导入的共管表交叉核对。可通过 hopLimit / traverseInstruments 配置。",
      derivedFromGraph: derived,
      listedInXlsx: queryIsXlsxSubject ? xlsxInstruments : xlsxInstruments.filter((item) => coreTag(item.tag) === coreTag(query)),
      reachedThroughInstrument: throughOnly,
      agreement,
      disagreement,
      needsEngineeringConfirmation: true,
      options: { hopLimit, traverseInstruments },
    },
    sharedCard: {
      method: [
        "同卡件由点表 IO_LOCATION、风险分析文档和 PMS PDF 的序列表/槽位表分别提取，按来源列出并标出来源页与通道；冲突单独列出，不静默合并。",
        ...pmsRows.filter((row) => coreTag(row.tag) === coreTag(query)).map((row) => `查询位号亦见于 ${row.locator}（${row.fileName}${row.page ? ` 第 ${row.page} 页` : ""}）`),
      ].join(" "),
      fromPointTable,
      fromRiskDoc: riskPeers,
      fromPmsPdf,
      conflicts,
      excludedByDoc: riskParsed.listed.some((row) => coreTag(row.tag) === coreTag(query)) || riskParsed.excluded.length ? riskParsed.excluded : [],
      cardHint: riskParsed.cardHint ?? fromPmsPdf[0]?.sourceRefs?.[0]?.locator ?? null,
      needsEngineeringConfirmation: true,
    },
    evidenceDocuments: documents.map((doc) => ({ fileName: doc.fileName, parseStatus: doc.parseStatus })),
    pathIds,
  };
}
