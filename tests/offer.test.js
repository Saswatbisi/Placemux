import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";

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

const fakeOffer = {
  id: "685400000000000000000005",
  applicationId: fakeApplication.id,
  salary: 800000,
  startDate: new Date("2026-07-01T09:00:00.000Z"),
  probationPeriod: 3,
  status: "PENDING",
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
    offer: {
      findUnique: vi.fn(),
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

describe("Offers API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  // ===== GENERATE OFFER =====

  it("POST /api/v1/companies/:companyId/applications/:applicationId/offers — OWNER generates offer successfully", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      company: { status: "ACTIVE" },
    });
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.offer.findUnique.mockResolvedValue(null);
    db.offer.create.mockResolvedValue(fakeOffer);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "company_owner_id",
      email: "owner@company.com",
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/offers`,
      headers: authHeaders,
      payload: {
        salary: 800000,
        startDate: "2026-07-01T09:00:00.000Z",
        probationPeriod: 3,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe("PENDING");
    expect(db.offer.create).toHaveBeenCalled();
  });

  it("POST /api/v1/companies/:companyId/applications/:applicationId/offers — rejects duplicates", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "ADMIN",
      company: { status: "ACTIVE" },
    });
    db.application.findUnique.mockResolvedValue(fakeApplication);
    db.offer.findUnique.mockResolvedValue(fakeOffer);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/offers`,
      headers: authHeaders,
      payload: {
        salary: 800000,
        startDate: "2026-07-01T09:00:00.000Z",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("POST /api/v1/companies/:companyId/applications/:applicationId/offers — rejects if caller is not owner/admin", async () => {
    const db = createFakeDb();
    db.companyMembership.findUnique.mockResolvedValue({
      role: "MEMBER",
      company: { status: "ACTIVE" },
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${fakeCompany.id}/applications/${fakeApplication.id}/offers`,
      headers: authHeaders,
      payload: {
        salary: 800000,
        startDate: "2026-07-01T09:00:00.000Z",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  // ===== FETCH OFFER =====

  it("GET /api/v1/offers/:id — candidate retrieves offer", async () => {
    const db = createFakeDb();
    db.offer.findUnique.mockResolvedValue(fakeOffer);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: fakeUser.id,
      email: fakeUser.email,
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/offers/${fakeOffer.id}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(fakeOffer.id);
  });

  it("GET /api/v1/offers/:id — rejects unauthorized candidate", async () => {
    const db = createFakeDb();
    db.offer.findUnique.mockResolvedValue(fakeOffer);
    db.companyMembership.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "unauthorized_user_123",
      email: "intruder@example.com",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/offers/${fakeOffer.id}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(404);
  });

  // ===== SECURE E-SIGNING =====

  it("POST /api/v1/offers/:id/sign — successfully signs cryptographically and stores verification hash", async () => {
    const db = createFakeDb();
    db.offer.findUnique.mockResolvedValue(fakeOffer);
    db.offer.update.mockImplementation(({ data }) => {
      return {
        ...fakeOffer,
        status: "ACCEPTED",
        esignApproach: "CRYPTOGRAPHIC",
        signature: "Aarav Sharma",
        signatureHash: data.signatureHash,
      };
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: fakeUser.id,
      email: fakeUser.email,
    });
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
    const body = res.json();
    expect(body.data.status).toBe("ACCEPTED");
    expect(body.data.esignApproach).toBe("CRYPTOGRAPHIC");
    expect(body.data.signatureHash).toBeDefined();

    // Recompute expected hash manually to verify correctness
    const expectedData = JSON.stringify({
      offerId: fakeOffer.id,
      applicationId: fakeOffer.applicationId,
      salary: fakeOffer.salary,
      startDate: fakeOffer.startDate.toISOString(),
      probationPeriod: fakeOffer.probationPeriod,
      signature: "Aarav Sharma",
    });
    const expectedHash = crypto
      .createHmac("sha256", config.OFFER_SIGNING_SECRET)
      .update(expectedData)
      .digest("hex");

    expect(body.data.signatureHash).toBe(expectedHash);
  });

  it("POST /api/v1/offers/:id/sign — successfully signs via THIRD_PARTY and records provider transaction ID", async () => {
    const db = createFakeDb();
    db.offer.findUnique.mockResolvedValue(fakeOffer);
    db.offer.update.mockImplementation(({ data }) => {
      return {
        ...fakeOffer,
        status: "ACCEPTED",
        esignApproach: "THIRD_PARTY",
        providerTxId: data.providerTxId,
      };
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: fakeUser.id,
      email: fakeUser.email,
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/offers/${fakeOffer.id}/sign`,
      headers: authHeaders,
      payload: {
        esignApproach: "THIRD_PARTY",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("ACCEPTED");
    expect(body.data.esignApproach).toBe("THIRD_PARTY");
    expect(body.data.providerTxId).toContain("doc_docusign_");
  });

  it("POST /api/v1/offers/:id/sign — rejects signing if company is suspended", async () => {
    const db = createFakeDb();
    const suspendedOffer = {
      ...fakeOffer,
      application: {
        ...fakeApplication,
        job: {
          ...fakeJob,
          company: { ...fakeCompany, status: "SUSPENDED" },
        },
      },
    };
    db.offer.findUnique.mockResolvedValue(suspendedOffer);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: fakeUser.id,
      email: fakeUser.email,
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/offers/${fakeOffer.id}/sign`,
      headers: authHeaders,
      payload: {
        esignApproach: "THIRD_PARTY",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain("suspended");
  });

  // ===== INTEGRITY VERIFICATION & TAMPER PROVING =====

  it("GET /api/v1/offers/:id/verify — confirms authenticity of valid cryptographic signature", async () => {
    const db = createFakeDb();

    const mockData = JSON.stringify({
      offerId: fakeOffer.id,
      applicationId: fakeOffer.applicationId,
      salary: fakeOffer.salary,
      startDate: fakeOffer.startDate.toISOString(),
      probationPeriod: fakeOffer.probationPeriod,
      signature: "Aarav Sharma",
    });
    const mockHash = crypto
      .createHmac("sha256", config.OFFER_SIGNING_SECRET)
      .update(mockData)
      .digest("hex");

    const signedOffer = {
      ...fakeOffer,
      status: "ACCEPTED",
      esignApproach: "CRYPTOGRAPHIC",
      signature: "Aarav Sharma",
      signatureHash: mockHash,
    };
    db.offer.findUnique.mockResolvedValue(signedOffer);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/offers/${fakeOffer.id}/verify`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.valid).toBe(true);
    expect(body.data.esignApproach).toBe("CRYPTOGRAPHIC");
    expect(body.data.message).toContain("verified");
  });

  it("GET /api/v1/offers/:id/verify — flags invalid/tampered cryptographic signatures", async () => {
    const db = createFakeDb();

    // Compute mock hash for salary = 800000
    const mockData = JSON.stringify({
      offerId: fakeOffer.id,
      applicationId: fakeOffer.applicationId,
      salary: 800000,
      startDate: fakeOffer.startDate.toISOString(),
      probationPeriod: fakeOffer.probationPeriod,
      signature: "Aarav Sharma",
    });
    const mockHash = crypto
      .createHmac("sha256", config.OFFER_SIGNING_SECRET)
      .update(mockData)
      .digest("hex");

    // DB TAMPERING SIMULATION:
    // database contains salary = 900000 (modified by bad actor) but keeps signatureHash computed for 800000
    const tamperedOffer = {
      ...fakeOffer,
      salary: 900000,
      status: "ACCEPTED",
      esignApproach: "CRYPTOGRAPHIC",
      signature: "Aarav Sharma",
      signatureHash: mockHash,
    };
    db.offer.findUnique.mockResolvedValue(tamperedOffer);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/offers/${fakeOffer.id}/verify`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.valid).toBe(false);
    expect(body.data.tampered).toBe(true);
    expect(body.data.reason).toContain("validation failed");
  });

  it("GET /api/v1/offers/:id/verify — allows public access without authentication headers", async () => {
    const db = createFakeDb();

    const mockData = JSON.stringify({
      offerId: fakeOffer.id,
      applicationId: fakeOffer.applicationId,
      salary: fakeOffer.salary,
      startDate: fakeOffer.startDate.toISOString(),
      probationPeriod: fakeOffer.probationPeriod,
      signature: "Aarav Sharma",
    });
    const mockHash = crypto
      .createHmac("sha256", config.OFFER_SIGNING_SECRET)
      .update(mockData)
      .digest("hex");

    const signedOffer = {
      ...fakeOffer,
      status: "ACCEPTED",
      esignApproach: "CRYPTOGRAPHIC",
      signature: "Aarav Sharma",
      signatureHash: mockHash,
    };
    db.offer.findUnique.mockResolvedValue(signedOffer);

    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/offers/${fakeOffer.id}/verify`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.valid).toBe(true);
    expect(body.data.esignApproach).toBe("CRYPTOGRAPHIC");
  });
});
