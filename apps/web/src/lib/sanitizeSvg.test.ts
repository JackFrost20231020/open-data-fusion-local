import { describe, expect, it } from "vitest";

import { sanitizeSvg } from "./sanitizeSvg";

describe("client sanitizeSvg", () => {
  it("does not retain onerror or onbegin handlers from a stored payload", () => {
    const clean = sanitizeSvg('<g><image onerror="window.__odf_probe_onerror=1"/><animate onbegin="window.__odf_probe_onbegin=1"/></g>');
    expect(clean.toLowerCase()).not.toMatch(/onerror|onbegin|__/);
  });

  it("strips fill external url() and CSS-escaped url() but keeps #fragments", () => {
    const clean = sanitizeSvg(`<g style="fill:u\\72l(https://example.invalid/collect)"><rect fill="url(http://127.0.0.1:9/fill)"/><rect fill="url(#g)"/></g>`);
    expect(clean).toMatch(/fill="url\(#g\)"/);
    expect(clean.toLowerCase()).not.toMatch(/example\.invalid/);
    expect(clean.toLowerCase()).not.toMatch(/http:\/\/127/);
  });
});
