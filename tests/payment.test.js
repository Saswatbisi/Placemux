import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";

const mockOrdersCreate = vi.fn();
const mockPaymentsFetch = vi.fn();
const mockPaymentsCapture = vi.fn();
const mockRefundsCreate = vi.fn();
const mockPaymentsAll = vi.fn();
const mockPaymentsRefund = vi.fn();

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
          all: mockPaymentsAll,
          refund: mockPaymentsRefund,
        },
        refunds: {
          create: mockRefundsCreate,
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
    mockRefundsCreate.mockResolvedValue({
      id: "ref_fake123",
      amount: 10000,
    });
    mockPaymentsRefund.mockResolvedValue({
      id: "ref_fake123",
      amount: 10000,
    });
    mockPaymentsAll.mockResolvedValue({
      items: [],
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

  // ===== RECEIPTS =====

  it("GET /api/v1/payments/:id/receipt — successfully fetches receipt for completed payment", async () => {
    const db = createFakeDb();
    const completedPayment = {
      ...fakePayment,
      status: "COMPLETED",
      gatewayPaymentId: "pay_fake123",
      user: { name: "Aarav Sharma", email: "aarav@example.com" },
      job: {
        title: "React Developer",
        company: { displayName: "Acme Corp" },
      },
    };
    db.payment.findUnique.mockResolvedValue(completedPayment);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/payments/${fakePayment.id}/receipt`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.receiptNumber).toContain("REC-");
    expect(body.data.status).toBe("COMPLETED");
    expect(body.data.candidate.name).toBe("Aarav Sharma");
  });

  it("GET /api/v1/payments/:id/receipt — rejects if payment is not completed", async () => {
    const db = createFakeDb();
    db.payment.findUnique.mockResolvedValue(fakePayment); // status is PENDING

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/payments/${fakePayment.id}/receipt`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("RECEIPT_NOT_AVAILABLE");
  });

  it("GET /api/v1/payments/:id/receipt — rejects if payment belongs to someone else", async () => {
    const db = createFakeDb();
    db.payment.findUnique.mockResolvedValue(fakePayment);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "685400000000000000000099",
      email: "other@example.com",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/payments/${fakePayment.id}/receipt`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(403);
  });

  // ===== REFUNDS =====

  it("POST /api/v1/payments/:id/refund — successfully refunds payment and deletes application", async () => {
    const db = createFakeDb();
    const completedPayment = {
      ...fakePayment,
      status: "COMPLETED",
      gatewayPaymentId: "pay_fake123",
    };
    db.payment.findUnique.mockResolvedValue(completedPayment);
    db.payment.update.mockResolvedValue({
      ...completedPayment,
      status: "REFUNDED",
      gatewayRefundId: "ref_fake123",
    });
    db.application.delete = vi.fn().mockResolvedValue(true);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/payments/${fakePayment.id}/refund`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("REFUNDED");
    expect(mockRefundsCreate).toHaveBeenCalledWith({
      payment_id: "pay_fake123",
      amount: 10000,
    });
    expect(db.application.delete).toHaveBeenCalled();
  });

  it("POST /api/v1/payments/:id/refund — rejects if payment is not completed", async () => {
    const db = createFakeDb();
    db.payment.findUnique.mockResolvedValue(fakePayment); // status is PENDING

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/payments/${fakePayment.id}/refund`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("REFUND_NOT_ALLOWED");
  });

  // ===== WEBHOOKS =====

  it("POST /api/v1/payments/webhook — handles payment.captured and creates application", async () => {
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

    const webhookPayload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_fake123",
            order_id: "order_fake123",
            amount: 10000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    };

    const signature = crypto
      .createHmac("sha256", "fakeWebhookSecret1234567890")
      .update(JSON.stringify(webhookPayload))
      .digest("hex");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/webhook",
      headers: {
        "x-razorpay-signature": signature,
      },
      payload: webhookPayload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
    expect(db.payment.update).toHaveBeenCalled();
    expect(db.application.create).toHaveBeenCalled();
  });

  it("POST /api/v1/payments/webhook — rejects webhook signature mismatch", async () => {
    const db = createFakeDb();
    const app = await buildApp(db);
    apps.push(app);

    const webhookPayload = { event: "payment.captured" };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/webhook",
      headers: {
        "x-razorpay-signature": "invalid_signature",
      },
      payload: webhookPayload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_SIGNATURE");
  });

  // ===== RECONCILIATION =====

  it("GET /api/v1/payments/reconciliation — runs reconciliation showing MATCHED when perfectly aligned", async () => {
    const db = createFakeDb();
    const dbCompletedPayment = {
      ...fakePayment,
      status: "COMPLETED",
      gatewayPaymentId: "pay_fake123",
      createdAt: new Date(),
    };
    db.payment.findMany = vi.fn().mockResolvedValue([dbCompletedPayment]);

    mockPaymentsAll.mockResolvedValueOnce([
      {
        id: "pay_fake123",
        order_id: "order_fake123",
        amount: 10000,
        currency: "INR",
        status: "captured",
      },
    ]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/payments/reconciliation?date=2026-06-23",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.reconciliationStatus).toBe("MATCHED");
    expect(body.data.discrepancyCount).toBe(0);
    expect(body.data.reconciledCount).toBe(1);
    expect(body.data.totalAmountDb).toBe(10000);
    expect(body.data.totalAmountGateway).toBe(10000);
  });

  it("GET /api/v1/payments/reconciliation — reports discrepancies correctly", async () => {
    const db = createFakeDb();
    const dbCompletedPayment = {
      ...fakePayment,
      id: "db_pay_1",
      status: "COMPLETED",
      gatewayPaymentId: "pay_matched_1",
      amount: 10000,
      createdAt: new Date(),
    };
    const dbStatusMismatchPayment = {
      ...fakePayment,
      id: "db_pay_2",
      status: "COMPLETED",
      gatewayPaymentId: "pay_status_mismatch",
      amount: 10000,
      createdAt: new Date(),
    };
    const dbAmountMismatchPayment = {
      ...fakePayment,
      id: "db_pay_3",
      status: "COMPLETED",
      gatewayPaymentId: "pay_amount_mismatch",
      amount: 10000,
      createdAt: new Date(),
    };
    const dbMissingOnGatewayPayment = {
      ...fakePayment,
      id: "db_pay_4",
      status: "COMPLETED",
      gatewayPaymentId: "pay_missing_on_gateway",
      amount: 10000,
      createdAt: new Date(),
    };

    db.payment.findMany = vi
      .fn()
      .mockResolvedValue([
        dbCompletedPayment,
        dbStatusMismatchPayment,
        dbAmountMismatchPayment,
        dbMissingOnGatewayPayment,
      ]);

    mockPaymentsAll.mockResolvedValueOnce([
      {
        id: "pay_matched_1",
        order_id: "order_fake123",
        amount: 10000,
        currency: "INR",
        status: "captured",
      },
      {
        id: "pay_status_mismatch",
        order_id: "order_fake123",
        amount: 10000,
        currency: "INR",
        status: "failed", // Should trigger STATUS_MISMATCH (captured in DB, failed on gateway)
      },
      {
        id: "pay_amount_mismatch",
        order_id: "order_fake123",
        amount: 5000, // Should trigger AMOUNT_MISMATCH
        currency: "INR",
        status: "captured",
      },
      // pay_missing_on_gateway is omitted here to trigger MISSING_ON_GATEWAY
      {
        id: "pay_missing_in_db", // Captured on gateway, missing in DB
        order_id: "order_other",
        amount: 15000,
        currency: "INR",
        status: "captured",
      },
    ]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/payments/reconciliation?date=2026-06-23",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.reconciliationStatus).toBe("DISCREPANCY_FOUND");
    expect(body.data.discrepancyCount).toBe(4);
    expect(body.data.reconciledCount).toBe(1);

    const types = body.data.discrepancies.map((d) => d.type);
    expect(types).toContain("STATUS_MISMATCH");
    expect(types).toContain("AMOUNT_MISMATCH");
    expect(types).toContain("MISSING_ON_GATEWAY");
    expect(types).toContain("MISSING_IN_DB");
  });
});
