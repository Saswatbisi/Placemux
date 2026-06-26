import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const fakeUser = {
  id: "685400000000000000000001",
  name: "Aarav Sharma",
  email: "aarav@example.com",
};

const fakeCompany = {
  id: "685400000000000000000002",
  displayName: "Acme Corp",
  status: "ACTIVE",
};

const fakeJob = {
  id: "685400000000000000000003",
  companyId: fakeCompany.id,
  title: "React Developer",
  status: "PUBLISHED",
  company: fakeCompany,
};

const fakeApplication = {
  id: "685400000000000000000004",
  jobId: fakeJob.id,
  userId: fakeUser.id,
  status: "SHORTLISTED",
  job: fakeJob,
  user: fakeUser,
};

const fakeInterview = {
  id: "685400000000000000000005",
  applicationId: fakeApplication.id,
  title: "Technical Round 1",
  scheduledAt: new Date("2026-07-01T10:00:00.000Z"),
  duration: 45,
  status: "SCHEDULED",
  meetingLink: "https://meet.google.com/abc-xyz-123",
  interviewerName: "Sohan Lal",
  application: fakeApplication,
};

function createFakeDb() {
  const db = {
    $disconnect: vi.fn(),
    companyMembership: {
      findUnique: vi.fn(),
    },
    application: {
      findUnique: vi.fn(),
    },
    interview: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  db.$transaction = vi.fn().mockImplementation((callback) => callback(db));
  return db;
}

async function getAuthHeaders(
  app,
  payload = { userId: fakeUser.id, email: fakeUser.email },
) {
  const token = app.jwt.sign(payload);
  return {
    Authorization: `Bearer ${token}`,
  };
}

describe("Interviews API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  // ===== SCHEDULE INTERVIEW =====

  it("POST /api/v1/companies/:companyId/applications/:applicationId/interviews — OWNER schedules interview successfully", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      company: { status: "ACTIVE" },
    });
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.interview.create.mockResolvedValue(fakeInterview);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "company_owner_id",
      email: "owner@company.com",
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/interviews`,
      headers: authHeaders,
      payload: {
        title: "Technical Round 1",
        scheduledAt: "2026-07-01T10:00:00.000Z",
        duration: 45,
        meetingLink: "https://meet.google.com/abc-xyz-123",
        interviewerName: "Sohan Lal",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe("SCHEDULED");
    expect(db.interview.create).toHaveBeenCalled();
  });

  it("POST /api/v1/companies/:companyId/applications/:applicationId/interviews — rejects if caller is candidate (not company member)", async () => {
    const db = createFakeDb();
    // No company membership for applicant user
    db.companyMembership.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/interviews`,
      headers: authHeaders,
      payload: {
        title: "Technical Round 1",
        scheduledAt: "2026-07-01T10:00:00.000Z",
        duration: 45,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toContain("Company not found");
  });

  it("POST /api/v1/companies/:companyId/applications/:applicationId/interviews — rejects if company is suspended", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      company: { status: "SUSPENDED" },
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "company_owner_id",
      email: "owner@company.com",
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/interviews`,
      headers: authHeaders,
      payload: {
        title: "Technical Round 1",
        scheduledAt: "2026-07-01T10:00:00.000Z",
        duration: 45,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain("suspended");
  });

  it("POST /api/v1/companies/:companyId/applications/:applicationId/interviews — validates input fields", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);

    // Past scheduledAt
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/interviews`,
      headers: authHeaders,
      payload: {
        title: "Technical Round 1",
        scheduledAt: "2020-01-01T10:00:00.000Z",
        duration: 45,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("validation failed");
  });

  // ===== GET INTERVIEWS FOR APPLICATION =====

  it("GET /api/v1/applications/:applicationId/interviews — candidate retrieves their own interviews successfully", async () => {
    const db = createFakeDb();
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.interview.findMany.mockResolvedValue([fakeInterview]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${fakeApplication.id}/interviews`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].title).toBe("Technical Round 1");
  });

  it("GET /api/v1/applications/:applicationId/interviews — company member retrieves application interviews successfully", async () => {
    const db = createFakeDb();
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.companyMembership.findUnique.mockResolvedValue({
      role: "MEMBER",
      company: { status: "ACTIVE" },
    });
    db.interview.findMany.mockResolvedValue([fakeInterview]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "company_member_id",
      email: "member@company.com",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${fakeApplication.id}/interviews`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
  });

  it("GET /api/v1/applications/:applicationId/interviews — rejects unauthorized user", async () => {
    const db = createFakeDb();
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.companyMembership.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "intruder_user_id",
      email: "intruder@gmail.com",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${fakeApplication.id}/interviews`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(404);
  });

  // ===== GET INTERVIEW BY ID =====

  it("GET /api/v1/interviews/:id — candidate retrieves interview details successfully", async () => {
    const db = createFakeDb();
    db.interview.findUnique.mockResolvedValue(fakeInterview);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/interviews/${fakeInterview.id}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(fakeInterview.id);
  });

  it("GET /api/v1/interviews/:id — rejects unauthorized candidate", async () => {
    const db = createFakeDb();
    db.interview.findUnique.mockResolvedValue(fakeInterview);
    db.companyMembership.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "intruder_user_id",
      email: "intruder@gmail.com",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/interviews/${fakeInterview.id}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(404);
  });

  // ===== UPDATE INTERVIEW =====

  it("PATCH /api/v1/interviews/:id — company member updates details successfully", async () => {
    const db = createFakeDb();
    db.interview.findUnique.mockResolvedValue(fakeInterview);
    db.companyMembership.findUnique.mockResolvedValue({
      role: "ADMIN",
      company: { status: "ACTIVE" },
    });
    db.interview.update.mockResolvedValue({
      ...fakeInterview,
      status: "COMPLETED",
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "company_admin_id",
      email: "admin@company.com",
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/interviews/${fakeInterview.id}`,
      headers: authHeaders,
      payload: {
        status: "COMPLETED",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("COMPLETED");
  });

  it("PATCH /api/v1/interviews/:id — rejects if candidate tries to update status", async () => {
    const db = createFakeDb();
    db.interview.findUnique.mockResolvedValue(fakeInterview);
    db.companyMembership.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/interviews/${fakeInterview.id}`,
      headers: authHeaders,
      payload: {
        status: "CANCELLED",
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
