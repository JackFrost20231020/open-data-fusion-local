import { describe, expect, it } from "vitest";

import { sanitizeSvg } from "../src/case/sanitize-svg.js";

describe("sanitizeSvg", () => {
  it("strips script, event handlers, foreignObject, javascript hrefs and external refs", () => {
    const dirty = `
      <g>
        <script>window.__odf_probe_script=1</script>
        <image href="javascript:alert(1)" onerror="window.__odf_probe_onerror=1"/>
        <animate onbegin="window.__odf_probe_onbegin=1" attributeName="x" dur="1s"/>
        <foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>window.__x=1</script></body></foreignObject>
        <use href="https://evil.example/x.svg#a"/>
        <a href="javascript:alert(1)"></a>
        <circle cx="5" cy="5" r="4" onclick="alert(1)"/>
      </g>
    `;
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toMatch(/script/);
    expect(clean.toLowerCase()).not.toMatch(/foreignobject/);
    expect(clean.toLowerCase()).not.toMatch(/onerror/);
    expect(clean.toLowerCase()).not.toMatch(/onbegin/);
    expect(clean.toLowerCase()).not.toMatch(/onclick/);
    expect(clean.toLowerCase()).not.toMatch(/javascript:/);
    expect(clean.toLowerCase()).not.toMatch(/https:\/\/evil/);
    expect(clean).toMatch(/<circle /);
    expect(clean).not.toMatch(/alert/);
  });

  it("preserves a benign instrument glyph", () => {
    const svg = '<g xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></g>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  it("turns a draw.io foreignObject label into SVG text and drops the viewer fallback", () => {
    const dirty = `<g><switch>
      <foreignObject width="20px" height="32px" requiredFeatures="http://www.w3.org/TR/SVG11/feature#Extensibility">
        <div xmlns="http://www.w3.org/1999/xhtml"><div style="font-size: 12px; transform: scale(0.5);">M</div></div>
      </foreignObject>
      <text x="10" y="11" fill="#000000" font-size="12px">[Not supported by viewer]</text>
    </switch></g>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toMatch(/>M</);
    expect(clean).not.toMatch(/Not supported by viewer/);
    expect(clean.toLowerCase()).not.toMatch(/foreignobject/);
    expect(clean.toLowerCase()).not.toMatch(/xmlns="http:\/\/www.w3.org\/1999\/xhtml"/);
  });

  it("does not keep script payload hidden inside a foreignObject", () => {
    const dirty = `<switch><foreignObject><script>window.__x=1</script>M</foreignObject><text>[Not supported by viewer]</text></switch>`;
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toMatch(/script/);
    expect(clean).not.toMatch(/__x/);
    expect(clean.toLowerCase()).not.toMatch(/foreignobject/);
  });

  it("strips style url() to external hosts", () => {
    const clean = sanitizeSvg(`<g style="fill: url(http://127.0.0.1:9/x)"></g>`);
    expect(clean.toLowerCase()).not.toMatch(/http:\/\/127/);
  });

  it("strips fill/stroke external url() but keeps internal fragment paint servers", () => {
    const dirty = `<g>
      <defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>
      <rect fill="url(http://127.0.0.1:9/fill)" stroke="url(https://example.invalid/s)" width="10" height="10"/>
      <rect fill="url(#g)" width="8" height="8"/>
    </g>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toMatch(/fill="url\(#g\)"/);
    expect(clean.toLowerCase()).not.toMatch(/http:\/\/127/);
    expect(clean.toLowerCase()).not.toMatch(/example\.invalid/);
    expect(clean).toMatch(/linearGradient/);
  });

  it("strips CSS-escaped url() in style and paint attributes", () => {
    const dirty = `<g style="fill:u\\72l(https://example.invalid/collect)"></g><rect fill="url(http://127.0.0.1:9/fill)"/>`;
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toMatch(/example\.invalid/);
    expect(clean.toLowerCase()).not.toMatch(/http:\/\/127/);
    expect(clean.toLowerCase()).not.toMatch(/url\s*\(\s*https?:/);
  });
});
