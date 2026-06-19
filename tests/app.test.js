import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const fakeDb = {
  $disconnect: vi.fn(),
};

describe("HTTP API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps.length = 0;
  });

  it("reports service health", async () => {
    const app = await buildApp(fakeDb);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
  });

  it("rejects invalid signup data before touching the database", async () => {
    const app = await buildApp(fakeDb);
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/companies/signup",
      payload: {
        owner: {
          name: "A",
          email: "not-an-email",
          password: "weak",
        },
        company: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("protects company profile endpoints", async () => {
    const app = await buildApp(fakeDb);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/companies/507f1f77bcf86cd799439011",
    });

    expect(response.statusCode).toBe(401);
  });
});
