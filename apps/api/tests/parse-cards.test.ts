import { describe, expect, it } from "vitest";

import { collectPmsCards, parseRiskDocCards, sameCardKey } from "../src/case/parse-cards.js";

const pms = `
PMS demo sequence — same-card interference notes
SEQ01 TU3
1 DEMO-DS1
2 DEMO-PT010
3 DEMO-LT020
4 DEMO-FT030
5 DEMO-PT040
6 PT001
7 DEMO-LT050
8 DEMO-LT060
9 DEMO-PT070
10 DEMO-FT080
11 DEMO-LT090
12 Not Used
12 / 20

SEQ02 TU4
1 LT002
2 OTHER-LT001
13 / 20

BPL Slot 3-AI100 TU3
1 DEMO-PT010
BPL Slot 4-AI100 TU4
`;

describe("parse-cards", () => {
  it("associates PT001 with TU3 / 3-AI100 and LT002 with TU4 / 4-AI100", () => {
    const rows = collectPmsCards(pms, "pms.pdf");
    const pt = rows.find((row) => /PT001/i.test(row.tag));
    const lt = rows.find((row) => /LT002/i.test(row.tag));
    expect(pt?.tu).toBe("TU3");
    expect(pt?.cardId).toBe("3-AI100");
    expect(pt?.locator).toMatch(/ch6/);
    expect(lt?.tu).toBe("TU4");
    expect(lt?.cardId).toBe("4-AI100");
    expect(sameCardKey(pt!)).not.toBe(sameCardKey(lt!));
  });

  it("does not let a misaligned slot table place LT002 on the same 3-AI100 TU3 card as PT001", () => {
    const noisy = `${pms}

BPL Slot 3-AI100 TU3
6 DEMO-JE-FT102 DEMO-JE-LT002 DEMO-JE-LT002 DEMO-JE-LT002
`;
    const rows = collectPmsCards(noisy, "pms.pdf");
    const sameAsPt = rows.filter((row) => row.tu === "TU3" && row.cardId === "3-AI100" && /LT002/i.test(row.tag));
    expect(sameAsPt).toEqual([]);
    const lt = rows.find((row) => /LT002/i.test(row.tag));
    expect(lt?.tu).toBe("TU4");
  });

  it("parses risk-doc card peers without a hardcoded allowlist", () => {
    const parsed = parseRiskDocCards("同卡件干扰控制措施 使用 AI100 卡件：DEMO-PT040、DEMO-LT002、DEMO-PT010。", "risk.doc");
    expect(parsed.cardHint).toBe("AI100");
    expect(parsed.listed.map((row) => row.tag)).toEqual(expect.arrayContaining(["DEMO-PT040", "DEMO-LT002", "DEMO-PT010"]));
  });

  it("prefers the preceding page marker so a following header does not shift the page by one", () => {
    const text = `
PMS demo sequence — same-card interference notes
12 / 20
SEQ01 TU3
6 PT001
7 DEMO-LT050
13 / 20
SEQ01 TU4
6 LT002
BPL Slot 3-AI100 TU3
BPL Slot 4-AI100 TU4
`;
    const rows = collectPmsCards(text, "pms.pdf");
    const pt = rows.find((row) => /PT001/i.test(row.tag));
    const lt = rows.find((row) => /LT002/i.test(row.tag));
    expect(pt?.page).toBe("12");
    expect(lt?.page).toBe("13");
    expect(pt?.cardId).toBe("3-AI100");
    expect(lt?.cardId).toBe("4-AI100");
  });
});
