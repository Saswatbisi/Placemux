import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

// ---- Fake data ----

const fakeJob = {
  id: "507f1f77bcf86cd799439011",
  companyId: "507f1f77bcf86cd799439022",
  title: "Senior React Developer",
  description:
    "Build modern UIs with React and TypeScript for a fintech product.",
  location: "Bengaluru",
  employmentType: "FULL_TIME",
  workplaceType: "HYBRID",
  status: "PUBLISHED",
  assessmentToken: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  company: {
    id: "507f1f77bcf86cd799439022",
    displayName: "Acme Corp",
    profile: { logoUrl: null, city: "Bengaluru", state: "Karnataka" },
  },
  skillThresholds: [
    { id: "aaa111", skill: "React", skillKey: "react", minimumLevel: 70 },
    {
      id: "bbb222",
      skill: "TypeScript",
      skillKey: "typescript",
      minimumLevel: 50,
    },
  ],
  createdAt: new Date("2026-06-15T10:00:00Z"),
  updatedAt: new Date("2026-06-15T10:00:00Z"),
};

const fakeJob2 = {
  ...fakeJob,
  id: "507f1f77bcf86cd799439033",
  title: "Node.js Backend Engineer",
  description: "Design and build scalable APIs with Node.js and Fastify.",
  location: "Mumbai",
  employmentType: "CONTRACT",
  workplaceType: "REMOTE",
  assessmentToken: "d4e5f6a7-b8c9-0123-defg-hijklmnopqrs",
  skillThresholds: [
    { id: "ccc333", skill: "Node.js", skillKey: "node.js", minimumLevel: 60 },
  ],
  createdAt: new Date("2026-06-10T10:00:00Z"),
  updatedAt: new Date("2026-06-10T10:00:00Z"),
};

// ---- Fake DB (mocked Prisma) ----

function createFakeDb() {
  return {
    $disconnect: vi.fn(),
    job: {
      findMany: vi.fn().mockResolvedValue([fakeJob, fakeJob2]),
      findUnique: vi.fn().mockResolvedValue(fakeJob),
    },
    jobSkillThreshold: {
      findMany: vi.fn().mockResolvedValue([
        { skill: "React", skillKey: "react" },
        { skill: "TypeScript", skillKey: "typescript" },
        { skill: "React", skillKey: "react" },
        { skill: "Node.js", skillKey: "node.js" },
      ]),
    },
  };
}

// ---- Tests ----

describe("Search & Discovery API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  // ===== SEARCH =====

  it("GET /api/v1/search/jobs — returns published jobs", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({ method: "GET", url: "/api/v1/search/jobs" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination).toBeDefined();
    expect(body.data.pagination.hasNextPage).toBe(false);
  });

  it("GET /api/v1/search/jobs?q=React — keyword search works", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/jobs?q=React",
    });

    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    // React job should be ranked higher (title match = 3 points)
    expect(items[0].title).toBe("Senior React Developer");
  });

  it("GET /api/v1/search/jobs with filters — passes filters to DB", async () => {
    const db = createFakeDb();
    db.job.findMany.mockResolvedValue([fakeJob]);
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/jobs?employmentType=FULL_TIME&workplaceType=HYBRID&location=Bengaluru",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toHaveLength(1);

    // Verify Prisma was called with filters
    const call = db.job.findMany.mock.calls[0][0];
    expect(call.where.employmentType).toEqual({ in: ["FULL_TIME"] });
    expect(call.where.workplaceType).toEqual({ in: ["HYBRID"] });
    expect(call.where.location).toEqual({
      contains: "Bengaluru",
      mode: "insensitive",
    });
  });

  it("GET /api/v1/search/jobs?skills=react — filters by skill", async () => {
    const db = createFakeDb();
    db.job.findMany.mockResolvedValue([fakeJob]);
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/jobs?skills=react",
    });

    expect(res.statusCode).toBe(200);
    const call = db.job.findMany.mock.calls[0][0];
    expect(call.where.skillThresholds).toEqual({
      some: { skillKey: { in: ["react"] } },
    });
  });

  it("GET /api/v1/search/jobs — validates bad query params", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/jobs?limit=999",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/v1/search/jobs/:jobId — returns single job", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/jobs/507f1f77bcf86cd799439011",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe("Senior React Developer");
    expect(res.json().data.assessmentUrl).toContain("/assessments/");
  });

  it("GET /api/v1/search/jobs/:jobId — 404 for missing job", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(null);
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search/jobs/507f1f77bcf86cd799439099",
    });

    expect(res.statusCode).toBe(404);
  });

  // ===== DISCOVERY =====

  it("GET /api/v1/discover/recent — returns latest jobs", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discover/recent?limit=5",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination.limit).toBe(5);
  });

  it("GET /api/v1/discover/skills — returns skill facets", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discover/skills",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // react appears twice, typescript once, node.js once
    expect(body.data.items[0].skill).toBe("React");
    expect(body.data.items[0].count).toBe(2);
    expect(body.data.total).toBe(3);
  });

  it("GET /api/v1/discover/locations — returns location facets", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discover/locations",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items[0]).toHaveProperty("location");
    expect(body.data.items[0]).toHaveProperty("count");
  });

  it("GET /api/v1/discover/employment-types — returns type breakdown", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/discover/employment-types",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items[0]).toHaveProperty("type");
    expect(body.data.items[0]).toHaveProperty("count");
  });
});
