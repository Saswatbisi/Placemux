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
  skillThresholds: [],
};

const fakeApplication = {
  id: "685400000000000000000004",
  jobId: fakeJob.id,
  userId: fakeUser.id,
  status: "PENDING",
  job: fakeJob,
  user: fakeUser,
  candidateSkills: [],
};

const fakeStatusRecord = {
  id: "685400000000000000000009",
  applicationId: fakeApplication.id,
  status: "APPLIED",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createFakeDb() {
  const db = {
    $disconnect: vi.fn(),
    companyMembership: {
      findUnique: vi.fn(),
    },
    application: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    applicationStatusRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    interview: {
      create: vi.fn(),
    },
    offer: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
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

describe("Application Unified Status API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  it("POST /api/v1/jobs/:jobId/applications — creates application and status record APPLIED", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(fakeJob);
    db.payment.findFirst.mockResolvedValue({
      id: "pay_1",
      status: "COMPLETED",
    });
    db.application.findUnique.mockResolvedValue(null);
    db.application.create.mockResolvedValue(fakeApplication);
    db.applicationStatusRecord.create.mockResolvedValue(fakeStatusRecord);

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
    expect(db.applicationStatusRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          applicationId: fakeApplication.id,
          status: "APPLIED",
        },
      }),
    );
  });

  it("GET /api/v1/applications/:id/status — returns status record details", async () => {
    const db = createFakeDb();
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.applicationStatusRecord.findUnique.mockResolvedValue(fakeStatusRecord);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${fakeApplication.id}/status`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("APPLIED");
    expect(db.applicationStatusRecord.findUnique).toHaveBeenCalled();
  });

  it("PATCH /api/v1/companies/:companyId/applications/:applicationId — transitions status to SHORTLISTED", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      company: { status: "ACTIVE" },
    });
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.application.update.mockResolvedValue({
      ...fakeApplication,
      status: "SHORTLISTED",
    });
    db.applicationStatusRecord.upsert.mockResolvedValue({
      ...fakeStatusRecord,
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
    expect(db.applicationStatusRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: fakeApplication.id },
        create: { applicationId: fakeApplication.id, status: "SHORTLISTED" },
        update: { status: "SHORTLISTED" },
      }),
    );
  });

  it("POST /api/v1/companies/:companyId/applications/:applicationId/interviews — transitions status to INTERVIEWING", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      company: { status: "ACTIVE" },
    });
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.interview.create.mockResolvedValue({ id: "interview_1" });
    db.applicationStatusRecord.upsert.mockResolvedValue({
      ...fakeStatusRecord,
      status: "INTERVIEWING",
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/interviews`,
      headers: authHeaders,
      payload: {
        title: "Technical Round 1",
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    expect(res.statusCode).toBe(201);
    expect(db.applicationStatusRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: fakeApplication.id },
        update: { status: "INTERVIEWING" },
      }),
    );
  });

  it("POST /api/v1/companies/:companyId/applications/:applicationId/offers — transitions status to OFFER_GENERATED", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      company: { status: "ACTIVE" },
    });
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.offer.create.mockResolvedValue({
      id: "offer_1",
      applicationId: fakeApplication.id,
    });
    db.applicationStatusRecord.upsert.mockResolvedValue({
      ...fakeStatusRecord,
      status: "OFFER_GENERATED",
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/offers`,
      headers: authHeaders,
      payload: {
        salary: 1000000,
        startDate: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    expect(res.statusCode).toBe(201);
    expect(db.applicationStatusRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: fakeApplication.id },
        update: { status: "OFFER_GENERATED" },
      }),
    );
  });

  it("POST /api/v1/offers/:id/sign — transitions status to OFFER_ACCEPTED", async () => {
    const db = createFakeDb();
    const fakeOffer = {
      id: "685400000000000000000005",
      applicationId: fakeApplication.id,
      salary: 1000000,
      startDate: new Date(Date.now() + 86400000),
      probationPeriod: 3,
      status: "PENDING",
      application: {
        ...fakeApplication,
        job: {
          ...fakeJob,
          company: { status: "ACTIVE" },
        },
      },
    };

    db.offer.findUnique.mockResolvedValue(fakeOffer);
    db.offer.update.mockResolvedValue({ ...fakeOffer, status: "ACCEPTED" });
    db.applicationStatusRecord.upsert.mockResolvedValue({
      ...fakeStatusRecord,
      status: "OFFER_ACCEPTED",
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/offers/${fakeOffer.id}/sign`,
      headers: authHeaders,
      payload: {
        esignApproach: "CRYPTOGRAPHIC",
        signature: "Aarav Sharma",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(db.applicationStatusRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: fakeApplication.id },
        update: { status: "OFFER_ACCEPTED" },
      }),
    );
  });
});
