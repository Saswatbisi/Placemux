import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const fakeDb = {
  $disconnect: vi.fn(),
};

const fakeUser = {
  id: "685400000000000000000001",
  name: "Aarav Sharma",
  email: "aarav@example.com",
};

async function getAuthHeaders(
  app,
  payload = { userId: fakeUser.id, email: fakeUser.email },
) {
  const token = app.jwt.sign(payload);
  return {
    Authorization: `Bearer ${token}`,
  };
}

describe("Parser API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  it("POST /api/v1/parser/resume — extracts skills and levels successfully", async () => {
    const app = await buildApp(fakeDb);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const text =
      "I am a Senior Developer. I excel in React (90% proficiency) and have been writing Node.js backend systems at level 80 for 3 years. I also know TypeScript.";
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/parser/resume",
      headers: authHeaders,
      payload: { text },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.skills).toEqual(
      expect.arrayContaining([
        { skill: "React", level: 90 },
        { skill: "Node.js", level: 80 },
        { skill: "TypeScript", level: 80 }, // Default level for resume is 80
      ]),
    );
  });

  it("POST /api/v1/parser/jd — extracts required skill thresholds successfully", async () => {
    const app = await buildApp(fakeDb);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const text =
      "We are seeking a developer. Minimum requirements: React level 75, Go level: 60. Knowledge of Docker is a plus.";
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/parser/jd",
      headers: authHeaders,
      payload: { text },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.skillThresholds).toEqual(
      expect.arrayContaining([
        { skill: "React", minimumLevel: 75 },
        { skill: "Go", minimumLevel: 60 },
        { skill: "Docker", minimumLevel: 70 }, // Default level for JD is 70
      ]),
    );
  });

  it("POST /api/v1/parser/resume — blocks unauthorized requests", async () => {
    const app = await buildApp(fakeDb);
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/parser/resume",
      payload: { text: "Some text" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/parser/resume — rejects validation on empty text", async () => {
    const app = await buildApp(fakeDb);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/parser/resume",
      headers: authHeaders,
      payload: { text: "" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});
