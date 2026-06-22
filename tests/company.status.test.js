import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

// ---- Fake data ----

const fakeUser = {
  id: "685400000000000000000001",
  name: "Aarav Sharma",
  email: "aarav@example.com",
};

const fakeCompany = {
  id: "685400000000000000000002",
  displayName: "Suspended Corp",
  status: "SUSPENDED",
};

const fakeJob = {
  id: "685400000000000000000003",
  companyId: fakeCompany.id,
  title: "React Developer",
  status: "PUBLISHED",
  assessmentToken: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  company: {
    id: fakeCompany.id,
    displayName: fakeCompany.displayName,
    status: "SUSPENDED",
  },
  skillThresholds: [],
};

function createFakeDb() {
  const db = {
    $disconnect: vi.fn(),
    companyMembership: {
      findUnique: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    application: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    companyProfile: {
      update: vi.fn(),
    },
    kycVerification: {
      findUnique: vi.fn(),
    },
  };
  db.$transaction = vi.fn().mockImplementation((callback) => callback(db));
  return db;
}

async function getAuthHeaders(app, payload = { userId: fakeUser.id, email: fakeUser.email }) {
  const token = app.jwt.sign(payload);
  return {
    Authorization: `Bearer ${token}`,
  };
}

describe("Suspended Company Constraints", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  it("blocks job creation for members of a suspended company", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      company: { status: "SUSPENDED" },
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/jobs`,
      headers: authHeaders,
      payload: {
        title: "Backend Engineer",
        description: "Build modern REST APIs using Fastify and Prisma for backend systems.",
        location: "Bengaluru",
        employmentType: "FULL_TIME",
        workplaceType: "HYBRID",
        skillThresholds: [{ skill: "React", minimumLevel: 70 }],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain("suspended");
  });

  it("blocks profile updates for members of a suspended company", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      company: { status: "SUSPENDED" },
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/companies/${fakeCompany.id}/profile`,
      headers: authHeaders,
      payload: {
        description: "Updated description",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain("suspended");
  });

  it("blocks applying to a job belonging to a suspended company", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(fakeJob);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${fakeJob.id}/applications`,
      headers: authHeaders,
      payload: {
        skills: [{ skill: "React", level: 80 }],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain("suspended");
  });
});
