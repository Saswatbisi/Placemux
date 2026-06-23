import crypto from "node:crypto";
import Razorpay from "razorpay";
import { config } from "../../config.js";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

export class PaymentService {
  constructor(db, razorpayClient = null) {
    this.db = db;
    // Injectable/Mockable client for isolated unit tests
    this.razorpay =
      razorpayClient ||
      new Razorpay({
        key_id: config.RAZORPAY_KEY_ID,
        key_secret: config.RAZORPAY_KEY_SECRET,
      });
  }

  async createCheckoutOrder(userId, jobId, input) {
    // 1. Fetch Job and check status & company state
    const job = await this.db.job.findUnique({
      where: { id: jobId },
      include: {
        skillThresholds: true,
        company: {
          select: { status: true },
        },
      },
    });

    if (!job || job.status !== "PUBLISHED") {
      throw new NotFoundError("Job not found");
    }

    if (job.company?.status === "SUSPENDED") {
      throw new ForbiddenError("This company is suspended");
    }

    // 2. Prevent duplicate applications
    const existing = await this.db.application.findUnique({
      where: {
        jobId_userId: { jobId, userId },
      },
    });

    if (existing) {
      throw new ConflictError("You have already applied to this job");
    }

    // 3. Enforce skill thresholds
    const candidateSkillMap = new Map(
      input.skills.map((s) => [
        s.skill.trim().toLocaleLowerCase("en-IN"),
        s.level,
      ]),
    );

    const missingSkills = [];
    const belowThresholdSkills = [];

    for (const threshold of job.skillThresholds) {
      const candidateLevel = candidateSkillMap.get(threshold.skillKey);
      if (candidateLevel === undefined) {
        missingSkills.push(threshold.skill);
      } else if (candidateLevel < threshold.minimumLevel) {
        belowThresholdSkills.push(
          `${threshold.skill} (requires level ${threshold.minimumLevel}, provided level ${candidateLevel})`,
        );
      }
    }

    if (missingSkills.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Missing required skills: ${missingSkills.join(", ")}`,
        { missingSkills },
      );
    }

    if (belowThresholdSkills.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Skill level is below the minimum required for: ${belowThresholdSkills.join(", ")}`,
        { belowThresholdSkills },
      );
    }

    // 4. Create Razorpay Order
    const amount = 10000; // ₹100 in paise
    let gatewayOrder;
    try {
      gatewayOrder = await this.razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: `receipt_job_${jobId.slice(-6)}_${userId.slice(-6)}`,
      });
    } catch (err) {
      throw new AppError(
        500,
        "PAYMENT_GATEWAY_ERROR",
        "Failed to create payment order with gateway",
        { originalError: err.message },
      );
    }

    // 5. Persist Pending Payment record
    const payment = await this.db.payment.create({
      data: {
        userId,
        jobId,
        amount,
        currency: "INR",
        status: "PENDING",
        gatewayOrderId: gatewayOrder.id,
        skillsJson: JSON.stringify(input.skills),
      },
    });

    return {
      paymentId: payment.id,
      gatewayOrderId: gatewayOrder.id,
      amount,
      currency: "INR",
      keyId: config.RAZORPAY_KEY_ID,
    };
  }

  async verifyPayment(userId, payload) {
    const { gatewayOrderId, gatewayPaymentId, gatewaySignature } = payload;

    // 1. Fetch pending payment
    const payment = await this.db.payment.findUnique({
      where: { gatewayOrderId },
      include: {
        job: {
          include: {
            skillThresholds: true,
            company: { select: { status: true } },
          },
        },
      },
    });

    if (!payment || payment.status !== "PENDING") {
      throw new NotFoundError("Payment order not found");
    }

    if (payment.userId !== userId) {
      throw new ForbiddenError("You are not authorized to verify this payment");
    }

    // 2. Verify signature
    const hmac = crypto.createHmac("sha256", config.RAZORPAY_KEY_SECRET);
    hmac.update(`${gatewayOrderId}|${gatewayPaymentId}`);
    const expectedSignature = hmac.digest("hex");

    if (expectedSignature !== gatewaySignature) {
      // Record failure state
      await this.db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          gatewayPaymentId,
          gatewaySignature,
        },
      });
      throw new AppError(
        400,
        "INVALID_SIGNATURE",
        "Payment signature verification failed",
      );
    }

    // 2.5 Fetch payment from gateway to verify amount, currency, and capture status
    let gatewayPayment;
    try {
      gatewayPayment = await this.razorpay.payments.fetch(gatewayPaymentId);
    } catch (err) {
      throw new AppError(
        500,
        "PAYMENT_GATEWAY_ERROR",
        "Failed to fetch payment details from gateway",
        { originalError: err.message },
      );
    }

    if (
      gatewayPayment.amount !== payment.amount ||
      gatewayPayment.currency !== payment.currency
    ) {
      throw new AppError(
        400,
        "PAYMENT_AMOUNT_MISMATCH",
        "Payment amount or currency mismatch with gateway record",
      );
    }

    if (gatewayPayment.status === "failed") {
      await this.db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          gatewayPaymentId,
          gatewaySignature,
        },
      });
      throw new AppError(
        400,
        "PAYMENT_FAILED",
        "Payment status on gateway is failed",
      );
    }

    // Capture payment if it is authorized but not yet captured
    if (gatewayPayment.status === "authorized") {
      try {
        gatewayPayment = await this.razorpay.payments.capture(
          gatewayPaymentId,
          payment.amount,
          payment.currency,
        );
      } catch (err) {
        throw new AppError(
          500,
          "PAYMENT_GATEWAY_ERROR",
          "Failed to capture payment with gateway",
          { originalError: err.message },
        );
      }
    }

    if (gatewayPayment.status !== "captured") {
      throw new AppError(
        400,
        "PAYMENT_NOT_CAPTURED",
        `Payment could not be captured. Status: ${gatewayPayment.status}`,
      );
    }

    // 3. Robustness check: Ensure company is not suspended
    if (payment.job.company?.status === "SUSPENDED") {
      throw new ForbiddenError("This company is suspended");
    }

    // 4. Check duplicate application again
    const existing = await this.db.application.findUnique({
      where: {
        jobId_userId: { jobId: payment.jobId, userId: payment.userId },
      },
    });

    if (existing) {
      throw new ConflictError("You have already applied to this job");
    }

    const skills = JSON.parse(payment.skillsJson);

    // 5. Complete payment and create application atomically
    return this.db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "COMPLETED",
          gatewayPaymentId,
          gatewaySignature,
        },
      });

      return tx.application.create({
        data: {
          jobId: payment.jobId,
          userId: payment.userId,
          candidateSkills: {
            create: skills.map((s) => ({
              skill: s.skill.trim(),
              skillKey: s.skill.trim().toLocaleLowerCase("en-IN"),
              level: s.level,
            })),
          },
        },
        select: {
          id: true,
          jobId: true,
          userId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          candidateSkills: {
            select: {
              id: true,
              skill: true,
              level: true,
            },
          },
        },
      });
    });
  }
}
