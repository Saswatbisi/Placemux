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
  displayName: "Acme Corp",
};

const fakeJob = {
  id: "685400000000000000000003",
  companyId: fakeCompany.id,
  title: "React Developer",
  description: "Build modern frontend applications using React.",
  location: "Bengaluru",
  employmentType: "FULL_TIME",
  workplaceType: "HYBRID",
  status: "PUBLISHED",
  assessmentToken: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  skillThresholds: [
    { id: "threshold-1", skill: "React", skillKey: "react", minimumLevel: 70 },
  ],
};

const fakeApplication = {
  id: "685400000000000000000004",
  jobId: fakeJob.id,
  userId: fakeUser.id,
  status: "PENDING",
  createdAt: new Date(),
  updatedAt: new Date(),
  candidateSkills: [
    { id: "candidate-skill-1", skill: "React", level: 80 },
  ],
  job: {
    id: fakeJob.id,
    title: fakeJob.title,
    companyId: fakeCompany.id,
    company: {
      id: fakeCompany.id,
      displayName: fakeCompany.displayName,
    },
  },
  user: {
    id: fakeUser.id,
    name: fakeUser.name,
    email: fakeUser.email,
  },
};

// ---- Mocking helpers ----

function createFakeDb() {
  const db = {
    $disconnect: vi.fn(),
    companyMembership: {
      findUnique: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
    },
    application: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  db.$transaction = vi.fn().mockImplementation((callback) => callback(db));
  return db;
}

// ---- Helper to get authenticated client headers ----
async function getAuthHeaders(app, payload = { userId: fakeUser.id, email: fakeUser.email }) {
  const token = app.jwt.sign(payload);
  return {
    Authorization: `Bearer ${token}`,
  };
}

describe("Application & Shortlisting API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  // ===== STUDENT APPLICATION FLOW =====

  it("POST /api/v1/jobs/:jobId/applications — student successfully applies", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(fakeJob);
    db.application.findUnique.mockResolvedValue(null);
    db.application.create.mockResolvedValue(fakeApplication);

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

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.id).toBe(fakeApplication.id);
    expect(body.data.status).toBe("PENDING");
    expect(body.data.candidateSkills[0].level).toBe(80);
  });

  it("POST /api/v1/jobs/:jobId/applications — rejects if already applied", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(fakeJob);
    db.application.findUnique.mockResolvedValue(fakeApplication);

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

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("POST /api/v1/jobs/:jobId/applications — rejects if required skills are missing", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(fakeJob);
    db.application.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${fakeJob.id}/applications`,
      headers: authHeaders,
      payload: {
        // missing required React skill
        skills: [{ skill: "Node.js", level: 80 }],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/v1/jobs/:jobId/applications — rejects if skill levels are below threshold", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(fakeJob);
    db.application.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${fakeJob.id}/applications`,
      headers: authHeaders,
      payload: {
        // React minimum required level is 70. We send 50.
        skills: [{ skill: "React", level: 50 }],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("below the minimum required");
  });

  it("GET /api/v1/applications — lists candidate's own applications", async () => {
    const db = createFakeDb();
    db.application.findMany.mockResolvedValue([fakeApplication]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(fakeApplication.id);
  });

  it("GET /api/v1/applications/:id — returns application details to the applicant", async () => {
    const db = createFakeDb();
    db.application.findUnique.mockResolvedValue(fakeApplication);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${fakeApplication.id}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(fakeApplication.id);
  });

  // ===== COMPANY SHORTLIST FLOW =====

  it("PATCH /api/v1/companies/:companyId/applications/:applicationId — company owner can shortlist applicant", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({ role: "OWNER" });
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.application.update.mockResolvedValue({
      ...fakeApplication,
      status: "SHORTLISTED",
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}`,
      headers: authHeaders,
      payload: {
        status: "SHORTLISTED",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("SHORTLISTED");
  });

  it("PATCH /api/v1/companies/:companyId/applications/:applicationId — non-member/forbidden roles cannot shortlist", async () => {
    const db = createFakeDb();
    // Non-member (returns null)
    db.companyMembership.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}`,
      headers: authHeaders,
      payload: {
        status: "SHORTLISTED",
      },
    });

    expect(res.statusCode).toBe(404); // Returns 404 Company not found to prevent company enumeration
  });

  it("PATCH /api/v1/companies/:companyId/applications/:applicationId — forbidden roles (MEMBER) cannot shortlist", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({ role: "MEMBER" });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}`,
      headers: authHeaders,
      payload: {
        status: "SHORTLISTED",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/companies/:companyId/applications — admin can list all company applications", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({ role: "ADMIN" });
    db.application.findMany.mockResolvedValue([fakeApplication]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/companies/${fakeCompany.id}/applications`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});
