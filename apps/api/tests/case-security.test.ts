import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { mintDevToken, setDevAuthSecretForTests } from "../src/dev-auth.js";
import { FusionDatabase } from "../src/database.js";

describe("case import authorization and payload limits", () => {
  let tempDirectory: string;
  let database: FusionDatabase;
  let app: ReturnType<typeof createApp>;

  afterEach(() => {
    database?.close?.();
    setDevAuthSecretForTests(null);
    if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  });

  const devSecret = randomBytes(32);

  function setup(seed = true) {
    tempDirectory = mkdtempSync(join(tmpdir(), "odf-case-sec-"));
    setDevAuthSecretForTests(devSecret);
    database = new FusionDatabase({ path: join(tempDirectory, "test.db"), seed });
    app = createApp(database, undefined, {
      defaultPlatformContext: { tenantId: "demo", projectId: "north-plant" },
      devAuthSecret: devSecret,
    });
    return app;
  }

  function ownerHeaders(user = "harper.dennis", withToken = true) {
    const headers: Record<string, string> = {
      "x-odf-tenant-id": "demo",
      "x-odf-project-id": "north-plant",
      "x-odf-user": user,
    };
    if (withToken) headers.Authorization = `Bearer ${mintDevToken(user, { secret: devSecret })}`;
    return headers;
  }

  it("rejects import without an explicit identity", async () => {
    setup();
    const response = await request(app).post("/api/v1/cases/demo-case/import").send({});
    expect(response.status).toBe(401);
  });

  it("rejects a fake Authorization Bearer without x-odf-user", async () => {
    setup();
    const response = await request(app)
      .post("/api/v1/cases/eval-reg-authhdr/import")
      .set("Authorization", "Bearer not-a-real-token")
      .set("x-odf-tenant-id", "demo")
      .set("x-odf-project-id", "north-plant")
      .send({});
    expect(response.status).toBe(401);
  });

  it("rejects reads and imports that target a staging partition", async () => {
    setup();
    const response = await request(app)
      .get("/api/v1/cases/demo-case__staging/pages")
      .set("x-odf-user", "harper.dennis")
      .set("x-odf-tenant-id", "demo")
      .set("x-odf-project-id", "north-plant");
    expect(response.status).toBe(400);
  });

  it("rejects import from a guest or viewer", async () => {
    setup();
    const response = await request(app)
      .post("/api/v1/cases/demo-case/import")
      .set(ownerHeaders("samantha.lee"))
      .send({});
    expect(response.status).toBe(403);
  });

  it("rejects a file name that tries to escape the case directory", async () => {
    setup();
    const response = await request(app)
      .post("/api/v1/cases/demo-case/import")
      .set(ownerHeaders("harper.dennis"))
      .send({ files: { graph: "../etc/passwd" } });
    expect(response.status).toBe(400);
  });

  it("returns 413 without leaking server paths for an oversized JSON body", async () => {
    setup();
    const huge = { pad: "x".repeat(11 * 1024 * 1024) };
    const response = await request(app)
      .post("/api/v1/cases/demo-case/import")
      .set("x-odf-user", "harper.dennis")
      .set("x-odf-tenant-id", "demo")
      .set("x-odf-project-id", "north-plant")
      .set("content-type", "application/json")
      .send(JSON.stringify(huge));
    expect(response.status).toBe(413);
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/\/workspace\/open-data-fusion|node_modules|internal/);
    expect(response.body.error?.code).toBe("payload_too_large");
  });

  it("rejects owner self-declaration without a signed token", async () => {
    setup();
    const onlyHeader = await request(app)
      .post("/api/v1/cases/eval-r4-auth/import")
      .set("x-odf-user", "harper.dennis")
      .set("x-odf-tenant-id", "demo")
      .set("x-odf-project-id", "north-plant")
      .send({});
    expect(onlyHeader.status).toBe(401);

    const fakeAndOwner = await request(app)
      .post("/api/v1/cases/eval-r4-auth/import")
      .set("Authorization", "Bearer not-a-real-token")
      .set("x-odf-user", "harper.dennis")
      .set("x-odf-tenant-id", "demo")
      .set("x-odf-project-id", "north-plant")
      .send({});
    expect(fakeAndOwner.status).toBe(401);
  });

  it("rejects a token minted for a different user than the header", async () => {
    setup();
    const response = await request(app)
      .post("/api/v1/cases/eval-r4-auth/import")
      .set("Authorization", `Bearer ${mintDevToken("harper.dennis", { secret: devSecret })}`)
      .set("x-odf-user", "mallory")
      .set("x-odf-tenant-id", "demo")
      .set("x-odf-project-id", "north-plant")
      .send({});
    expect(response.status).toBe(401);
  });

  it("rejects a forged development token MAC", async () => {
    setup();
    const token = mintDevToken("harper.dennis", { secret: devSecret });
    const forged = `${token.slice(0, -4)}abcd`;
    const response = await request(app)
      .post("/api/v1/cases/eval-r4-auth/import")
      .set("Authorization", `Bearer ${forged}`)
      .set("x-odf-user", "harper.dennis")
      .set("x-odf-tenant-id", "demo")
      .set("x-odf-project-id", "north-plant")
      .send({});
    expect(response.status).toBe(401);
  });

  it("rejects an unallowlisted sourceDir and does not fall back to the default case package", async () => {
    setup();
    const response = await request(app)
      .post("/api/v1/cases/eval-r4-srcdir/import")
      .set(ownerHeaders("harper.dennis"))
      .send({ sourceDir: "/tmp/odf-unallowlisted-probe" });
    expect(response.status).toBe(400);
  });

  it("imports a small allowlisted fixture when a valid signed token is presented", async () => {
    setup();
    const response = await request(app)
      .post("/api/v1/cases/eval-r4-mini/import")
      .set(ownerHeaders("harper.dennis"))
      .send({ sourceDir: fileURLToPath(new URL("./fixtures/synth-case", import.meta.url)), files: { graph: "graph.ndjson" } });
    expect(response.status).toBe(200);
    expect(response.body.nodes.total).toBe(7);
    expect(response.body.integrity.complete).toBe(true);
    expect(String(response.body.sourceDir)).not.toMatch(/^\//);
  });

  it("rejects a reserved staging caseKey on import even with a valid token", async () => {
    setup();
    const response = await request(app)
      .post("/api/v1/cases/eval-r4-x__staging/import")
      .set(ownerHeaders("harper.dennis"))
      .send({ files: { graph: "graph.ndjson" } });
    expect(response.status).toBe(400);
  });
});
