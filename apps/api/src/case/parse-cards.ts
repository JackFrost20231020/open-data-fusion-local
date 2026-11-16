/** Data-driven extraction of I/O card / channel groups from parsed case documents. */

export interface CardChannel {
  tag: string;
  channel: number | null;
  cabinet: string | null;
  tu: string | null;
  cardId: string | null;
  sequence: string | null;
  source: "pms_pdf" | "risk_doc" | "point_table";
  fileName: string;
  page: string | null;
  locator: string;
  confidence: "high" | "medium" | "low";
  notes: string[];
}

const TAG_RE = /((?:[A-Z]{2,5}-)?(?:JE-)?(?:PT|LT|TE|FT|PY|ZT|PDT|RY|DS)[A-Z0-9-]*[A-Z0-9]|PMS[A-D]-[\w-]+|IDS[A-D]-DS\d+|Not Used)/i;

export function normalizeInstrumentTag(value: string): string {
  return value.replace(/-JE-/g, "-").replace(/\s+/g, "").trim().toUpperCase();
}

export function coreInstrumentTag(value: string): string {
  const text = normalizeInstrumentTag(value);
  const match = text.match(/((?:PT|LT|TE|FT|PY|ZT)\d+[A-Z]?)/i);
  if (match?.[1]) return match[1].toUpperCase();
  return text.replace(/^\d-/, "").replace(/^[A-Z]{2,5}-/, "");
}

function pageFromNearby(lines: string[], index: number): string | null {
  // Prefer the most recent printed page marker at or before this line
  // so a following page header is not attributed to the current row.
  for (let i = index; i >= Math.max(0, index - 80); i -= 1) {
    const hit = lines[i]?.match(/(\d{1,2})\s*\/\s*\d{1,3}\b/);
    if (hit?.[1]) return hit[1];
  }
  for (let i = index; i < Math.min(lines.length, index + 3); i += 1) {
    const hit = lines[i]?.match(/(\d{1,2})\s*\/\s*\d{1,3}\b/);
    if (hit?.[1]) return hit[1];
  }
  return null;
}

export function cardIdsFromDocument(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const patterns = [
    /(\d-AI\d+)\s*[/\s,]*?(TU\d{1,2})/gi,
    /(TU\d{1,2})\s*[/\s,]*?(\d-AI\d+)/gi,
    /BPL Slot\s+(\d-AI\d+)[^\n]{0,40}(TU\d{1,2})/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const a = match[1]?.toUpperCase();
      const b = match[2]?.toUpperCase();
      if (!a || !b) continue;
      if (a.startsWith("TU") && b.includes("AI")) map.set(a, b);
      else if (b.startsWith("TU") && a.includes("AI")) map.set(b, a);
    }
  }
  return map;
}

/** Parse "PMS D 序列同卡件干扰预防措施" style tables (section 8.1). */
export function parsePmsSequenceTables(text: string, fileName: string): CardChannel[] {
  const lines = text.split(/\r?\n/);
  const cardIds = cardIdsFromDocument(text);
  const rows: CardChannel[] = [];
  type Header = { line: number; sequence: string; cabinet: string; tu: string; cardId: string | null };
  type Channel = { line: number; sequence: string; channel: number; tag: string };
  const headers: Header[] = [];
  const channels: Channel[] = [];
  let sequence: string | null = null;
  let inSlotTable = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/BPL Slot/.test(line)) inSlotTable = true;
    if (/PMS\s+[A-D]\s*序列/.test(line) || /PMS\s+demo\s+sequence/i.test(line)) inSlotTable = false;
    const seqHit = line.match(/PMS\s+([A-D])\s*序列/) ?? line.match(/PMS\s+demo\s+sequence/i);
    if (seqHit) {
      sequence = (seqHit[1] ?? "D").toUpperCase();
      continue;
    }
    const header = line.match(/\b((?:BCC[A-D]\d{2}|SEQ\d{2}))\b\s+(TU\d{1,2})/i);
    if (header?.[1] && header[2] && !sequence) sequence = "D";
    if (!sequence || inSlotTable) continue;
    if (!header?.[1] || !header[2]) {
      const chEarly = line.match(/^\s*(\d{1,2})\s+([A-Z][A-Z0-9_/-]*[A-Z0-9]|Not Used)\b/i);
      if (!chEarly) continue;
    }
    if (header?.[1] && header[2]) {
      const tu = header[2].toUpperCase();
      headers.push({
        line: i,
        sequence,
        cabinet: header[1].toUpperCase(),
        tu,
        cardId: cardIds.get(tu) ?? null,
      });
    }
    const ch = line.match(/^\s*(\d{1,2})\s+([A-Z][A-Z0-9_/-]*[A-Z0-9]|Not Used)\b/i);
    if (!ch?.[1] || !ch[2]) continue;
    const channel = Number(ch[1]);
    if (!Number.isFinite(channel) || channel < 1 || channel > 16) continue;
    if (/^Not\s*Used$/i.test(ch[2])) continue;
    const tagMatch = ch[2].match(TAG_RE);
    if (!tagMatch?.[1]) continue;
    channels.push({ line: i, sequence, channel, tag: tagMatch[1] });
  }

  for (const item of channels) {
    const sameSeq = headers.filter((header) => header.sequence === item.sequence);
    if (!sameSeq.length) continue;
    let header = sameSeq.find((candidate) => candidate.line >= item.line);
    if (!header) header = sameSeq.at(-1);
    if (!header) continue;
    // Channel lines immediately after a later header belong to that header.
    const previous = [...sameSeq].reverse().find((candidate) => candidate.line <= item.line);
    const next = sameSeq.find((candidate) => candidate.line > item.line);
    const chosen = previous && next
      ? (item.line - previous.line <= next.line - item.line + 8 ? previous : header)
      : previous ?? header;
    rows.push({
      tag: item.tag,
      channel: item.channel,
      cabinet: chosen.cabinet,
      tu: chosen.tu,
      cardId: chosen.cardId,
      sequence: item.sequence,
      source: "pms_pdf",
      fileName,
      page: pageFromNearby(lines, item.line),
      locator: `${chosen.cabinet} ${chosen.tu} ch${item.channel}`,
      confidence: "high",
      notes: [`PMS ${item.sequence} 序列 ${chosen.cabinet} ${chosen.tu} 通道 ${item.channel}`],
    });
  }
  return rows;
}

/**
 * Parse "BPL Slot <card> / <TU>" wide tables (section 8.2 style).
 * Columns are typically A/B/C/D sequences.
 */
export function parsePmsSlotTables(text: string, fileName: string): CardChannel[] {
  const lines = text.split(/\r?\n/);
  const rows: CardChannel[] = [];
  let cardId: string | null = null;
  let tu: string | null = null;
  let cabinetHint: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const slot = line.match(/(\d-AI\d+)/);
    if (slot?.[1]) cardId = slot[1];
    const tuHit = line.match(/\b(TU\d{1,2})\b/);
    if (tuHit?.[1] && (cardId || /BPL Slot/.test(line) || /BCC/.test(line))) tu = tuHit[1].toUpperCase();
    const bcc = line.match(/\b(BCC[A-D0-9]+|SEQ\d{2})\b/);
    if (bcc?.[1]) cabinetHint = bcc[1].toUpperCase();

    const chStart = line.match(/^\s*(\d{1,2})\s{1,}(.+)$/);
    if (!chStart || !cardId || !tu) continue;
    const channel = Number(chStart[1]);
    if (channel < 1 || channel > 16) continue;
    const rest = chStart[2];
    // Collect JE/tag tokens in order; last of four columns is D sequence.
    const tags = [...rest.matchAll(/([A-Z]{2,5}-JE-[A-Z0-9]+|[A-Z]{2,5}-[A-Z]{2,}\d+[A-Z]?|PMS[A-D]-[\w-]+|IDS[A-D]-DS\d+|Not Used)/g)]
      .map((item) => item[1] ?? "")
      .filter(Boolean);
    if (!tags.length) continue;
    const sequences = ["A", "B", "C", "D"] as const;
    // When 4 tags, map A-D; when fewer, still record what we have from the right if D is last.
    tags.forEach((tag, index) => {
      if (/^Not Used$/i.test(tag) || /^NA$/i.test(tag)) return;
      const sequence = sequences[index] ?? null;
      rows.push({
        tag,
        channel,
        cabinet: sequence ? `BCC${sequence} (${cabinetHint ?? ""})`.replace(" ()", "") : cabinetHint,
        tu,
        cardId,
        sequence,
        source: "pms_pdf",
        fileName,
        page: pageFromNearby(lines, i),
        locator: `${cardId} ${tu} ch${channel} seq ${sequence ?? "?"}`,
        confidence: "high",
        notes: [`PMS 8.2 ${cardId} ${tu} 通道 ${channel} 序列 ${sequence ?? "?"}`],
      });
    });
  }
  return rows;
}

export function parseRiskDocCards(text: string, fileName: string): { listed: CardChannel[]; excluded: string[]; cardHint: string | null } {
  const cardHint = text.match(/使用\s*([A-Z0-9]+)\s*卡件/)?.[1]
    ?? text.match(/(AI\d+)\s*卡件/)?.[1]
    ?? null;
  const listed: CardChannel[] = [];
  const seen = new Set<string>();
  const section = text.split(/同卡件干扰控制措施/)[1] ?? text;
  const generic = section.matchAll(/\b((?:[A-Z]{2,5}-)?(?:PT|LT|FT|TE)\d+[A-Z]?|PCS-PT\d+|PXS-LT\d+|SGS-(?:LT|PT|FT)\d+[A-Z]?)\b/g);
  for (const match of generic) {
    const raw = match[1];
    if (!raw) continue;
    const tag = raw;
    const key = normalizeInstrumentTag(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    listed.push({
      tag,
      channel: null,
      cabinet: null,
      tu: null,
      cardId: cardHint,
      sequence: null,
      source: "risk_doc",
      fileName,
      locator: "措施04 同卡件干扰",
      page: null,
      confidence: "medium",
      notes: [cardHint ? `风险分析文档，卡件 ${cardHint}` : "风险分析文档中的同卡件措施"],
    });
  }
  const excluded: string[] = [];
  const excludeBlock = text.match(/对于([^\n]{0,200})根据PMS技术手册不涉及同卡件信号干扰/);
  if (excludeBlock?.[1]) {
    for (const token of excludeBlock[1].split(/[、，,]/)) {
      const tag = token.replace(/对于/g, "").trim();
      if (tag) excluded.push(tag);
    }
  }
  return { listed, excluded, cardHint };
}

export function parsePointTableCards(
  points: Array<{ name: string; fields: Record<string, string> }>,
  fileName: string,
): CardChannel[] {
  return points
    .filter((point) => point.fields.IO_LOCATION)
    .map((point) => ({
      tag: point.name,
      channel: point.fields.IO_CHANNEL ? Number(point.fields.IO_CHANNEL) : null,
      cabinet: null,
      tu: null,
      cardId: point.fields.IO_LOCATION ?? null,
      sequence: null,
      source: "point_table" as const,
      fileName,
      page: null,
      locator: `IO_LOCATION=${point.fields.IO_LOCATION}${point.fields.IO_CHANNEL ? ` ch${point.fields.IO_CHANNEL}` : ""}`,
      confidence: "medium" as const,
      notes: [`点表 ${point.name}`],
    }));
}

export function sameCardKey(row: CardChannel): string | null {
  if (row.source === "pms_pdf" && row.sequence && (row.cardId || row.tu)) {
    return `pms:${row.sequence}:${row.cardId ?? ""}:${row.tu ?? ""}:${row.cabinet ?? ""}`;
  }
  if (row.source === "point_table" && row.cardId) return `pt:${row.cardId}`;
  if (row.source === "risk_doc" && row.cardId) return `risk:${row.cardId}`;
  return null;
}

export function collectPmsCards(text: string, fileName: string): CardChannel[] {
  const sequence = parsePmsSequenceTables(text, fileName);
  if (sequence.length) return sequence;
  // Fall back to section 8.2 only when 8.1 tables were not found.
  return parsePmsSlotTables(text, fileName);
}
