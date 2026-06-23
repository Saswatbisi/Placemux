import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";

const mockOrdersCreate = vi.fn();
const mockPaymentsFetch = vi.fn();
const mockPaymentsCapture = vi.fn();

// ---- Mock Razorpay globally for this test file ----
vi.mock("razorpay", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        orders: {
          create: mockOrdersCreate,
        },
        payments: {
          fetch: mockPaymentsFetch,
          capture: mockPaymentsCapture,
        },
      };
    }),
  };
});

// ---- Fake data ----

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
  assessmentToken: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  company: {
    id: fakeCompany.id,
    displayName: fakeCompany.displayName,
    status: "ACTIVE",
  },
  skillThresholds: [
    { id: "threshold-1", skill: "React", skillKey: "react", minimumLevel: 70 },
  ],
};

const fakePayment = {
  id: "685400000000000000000004",
  userId: fakeUser.id,
  jobId: fakeJob.id,
  amount: 10000,
  currency: "INR",
  status: "PENDING",
  gatewayOrderId: "order_fake123",
  skillsJson: JSON.stringify([{ skill: "React", level: 80 }]),
  job: fakeJob,
};

const fakeApplication = {
  id: "685400000000000000000005",
  jobId: fakeJob.id,
  userId: fakeUser.id,
  status: "PENDING",
  createdAt: new Date(),
  updatedAt: new Date(),
  candidateSkills: [{ id: "candidate-skill-1", skill: "React", level: 80 }],
};

function createFakeDb() {
  const db = {
    $disconnect: vi.fn(),
    job: {
      findUnique: vi.fn(),
    },
    application: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    payment: {
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

describe("Payments API", () => {
  const apps = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrdersCreate.mockResolvedValue({
      id: "order_fake123",
      amount: 10000,
      currency: "INR",
    });
    mockPaymentsFetch.mockResolvedValue({
      id: "pay_fake123",
      status: "authorized",
      amount: 10000,
      currency: "INR",
    });
    mockPaymentsCapture.mockResolvedValue({
      id: "pay_fake123",
      status: "captured",
      amount: 10000,
      currency: "INR",
    });
  });

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  // ===== CHECKOUT =====

  it("POST /api/v1/payments/checkout — student successfully initiates checkout with valid skills", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(fakeJob);
    db.application.findUnique.mockResolvedValue(null);
    db.payment.create.mockResolvedValue(fakePayment);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/checkout",
      headers: authHeaders,
      payload: {
        jobId: fakeJob.id,
        skills: [{ skill: "React", level: 80 }],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.gatewayOrderId).toBe("order_fake123");
    expect(body.data.amount).toBe(10000);
  });

  it("POST /api/v1/payments/checkout — rejects if skills are below threshold", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue(fakeJob);
    db.application.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/checkout",
      headers: authHeaders,
      payload: {
        jobId: fakeJob.id,
        skills: [{ skill: "React", level: 50 }], // below threshold 70
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/v1/payments/checkout — rejects if company is suspended", async () => {
    const db = createFakeDb();
    db.job.findUnique.mockResolvedValue({
      ...fakeJob,
      company: { status: "SUSPENDED" },
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/checkout",
      headers: authHeaders,
      payload: {
        jobId: fakeJob.id,
        skills: [{ skill: "React", level: 80 }],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain("suspended");
  });

  // ===== VERIFICATION =====

  it("POST /api/v1/payments/verify — verifies payment and creates application on success", async () => {
    const db = createFakeDb();
    db.payment.findUnique.mockResolvedValue(fakePayment);
    db.application.findUnique.mockResolvedValue(null);
    db.application.create.mockResolvedValue(fakeApplication);
    db.payment.update.mockResolvedValue({
      ...fakePayment,
      status: "COMPLETED",
    });

    const app = await buildApp(db);
    apps.push(app);

    const gatewayOrderId = "order_fake123";
    const gatewayPaymentId = "pay_fake123";
    const gatewaySignature = crypto
      .createHmac("sha256", config.RAZORPAY_KEY_SECRET)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest("hex");

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/verify",
      headers: authHeaders,
      payload: {
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("PENDING");
    expect(db.payment.update).toHaveBeenCalled();
    expect(db.application.create).toHaveBeenCalled();
  });

  it("POST /api/v1/payments/verify — rejects and sets payment to FAILED on signature mismatch", async () => {
    const db = createFakeDb();
    db.payment.findUnique.mockResolvedValue(fakePayment);
    db.payment.update.mockResolvedValue({ ...fakePayment, status: "FAILED" });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/verify",
      headers: authHeaders,
      payload: {
        gatewayOrderId: "order_fake123",
        gatewayPaymentId: "pay_fake123",
        gatewaySignature: "invalid_sig_123456",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_SIGNATURE");
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("POST /api/v1/payments/verify — rejects if gateway payment amount/currency mismatches", async () => {
    const db = createFakeDb();
    db.payment.findUnique.mockResolvedValue(fakePayment);

    const app = await buildApp(db);
    apps.push(app);

    // Mismatched amount
    mockPaymentsFetch.mockResolvedValueOnce({
      id: "pay_fake123",
      status: "authorized",
      amount: 5000, // expecting 10000
      currency: "INR",
    });

    const gatewayOrderId = "order_fake123";
    const gatewayPaymentId = "pay_fake123";
    const gatewaySignature = crypto
      .createHmac("sha256", config.RAZORPAY_KEY_SECRET)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest("hex");

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/verify",
      headers: authHeaders,
      payload: {
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("PAYMENT_AMOUNT_MISMATCH");
  });

  it("POST /api/v1/payments/verify — rejects and sets payment to FAILED if gateway status is failed", async () => {
    const db = createFakeDb();
    db.payment.findUnique.mockResolvedValue(fakePayment);
    db.payment.update.mockResolvedValue({ ...fakePayment, status: "FAILED" });

    const app = await buildApp(db);
    apps.push(app);

    mockPaymentsFetch.mockResolvedValueOnce({
      id: "pay_fake123",
      status: "failed",
      amount: 10000,
      currency: "INR",
    });

    const gatewayOrderId = "order_fake123";
    const gatewayPaymentId = "pay_fake123";
    const gatewaySignature = crypto
      .createHmac("sha256", config.RAZORPAY_KEY_SECRET)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest("hex");

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/verify",
      headers: authHeaders,
      payload: {
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("PAYMENT_FAILED");
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});
