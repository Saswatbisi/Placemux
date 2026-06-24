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
          failureReason: "Signature verification failed",
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
      await this.db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          gatewayPaymentId,
          gatewaySignature,
          failureReason: "Payment amount or currency mismatch with gateway record",
        },
      });
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
          failureReason: gatewayPayment.error_description || "Payment status on gateway is failed",
        },
      });
      throw new AppError(
        400,
        "PAYMENT_FAILED",
        "Payment status on gateway is failed",
      );
    }

    // Capture payment if it is authorized but not yet captured
    let capturedOnGateway = gatewayPayment.status === "captured";
    if (gatewayPayment.status === "authorized") {
      try {
        gatewayPayment = await this.razorpay.payments.capture(
          gatewayPaymentId,
          payment.amount,
          payment.currency,
        );
        capturedOnGateway = true;
      } catch (err) {
        throw new AppError(
          500,
          "PAYMENT_GATEWAY_ERROR",
          "Failed to capture payment with gateway",
          { originalError: err.message },
        );
      }
    }

    if (!capturedOnGateway && gatewayPayment.status !== "captured") {
      throw new AppError(
        400,
        "PAYMENT_NOT_CAPTURED",
        `Payment could not be captured. Status: ${gatewayPayment.status}`,
      );
    }

    try {
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
      return await this.db.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "COMPLETED",
            gatewayPaymentId,
            gatewaySignature,
          },
        });

        return await tx.application.create({
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
    } catch (err) {
      let refundError = null;
      let gatewayRefund = null;

      try {
        gatewayRefund = await this.razorpay.refunds.create({
          payment_id: gatewayPaymentId,
          amount: payment.amount,
        });
      } catch (refErr) {
        try {
          gatewayRefund = await this.razorpay.payments.refund(
            gatewayPaymentId,
            { amount: payment.amount },
          );
        } catch (fallbackRefErr) {
          refundError = refErr.message || fallbackRefErr.message;
        }
      }

      const failureReason = `Application creation failed: ${err.message}.${refundError ? ` Auto-refund failed: ${refundError}` : ""}`;

      await this.db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          gatewayPaymentId,
          gatewaySignature,
          failureReason,
          gatewayRefundId: gatewayRefund?.id || null,
          refundedAt: gatewayRefund ? new Date() : null,
        },
      });

      throw err;
    }
  }

  async getReceipt(userId, paymentId) {
    const payment = await this.db.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: { select: { name: true, email: true } },
        job: {
          select: {
            title: true,
            company: { select: { displayName: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundError("Payment not found");
    }

    if (payment.userId !== userId) {
      throw new ForbiddenError("You are not authorized to view this receipt");
    }

    if (payment.status !== "COMPLETED") {
      throw new AppError(
        400,
        "RECEIPT_NOT_AVAILABLE",
        `Receipt is not available because payment status is ${payment.status}`,
      );
    }

    return {
      receiptNumber: `REC-${payment.id.slice(-6).toUpperCase()}-${payment.gatewayOrderId.slice(-6).toUpperCase()}`,
      paymentId: payment.id,
      gatewayPaymentId: payment.gatewayPaymentId,
      gatewayOrderId: payment.gatewayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      issuedAt: payment.updatedAt,
      candidate: {
        name: payment.user.name,
        email: payment.user.email,
      },
      job: {
        title: payment.job.title,
        companyName: payment.job.company.displayName,
      },
    };
  }

  async refundPayment(userId, paymentId) {
    const payment = await this.db.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundError("Payment not found");
    }

    if (payment.userId !== userId) {
      throw new ForbiddenError("You are not authorized to refund this payment");
    }

    if (payment.status !== "COMPLETED") {
      throw new AppError(
        400,
        "REFUND_NOT_ALLOWED",
        `Only completed payments can be refunded. Current status: ${payment.status}`,
      );
    }

    // Call Razorpay API
    let gatewayRefund;
    try {
      gatewayRefund = await this.razorpay.refunds.create({
        payment_id: payment.gatewayPaymentId,
        amount: payment.amount,
      });
    } catch (err) {
      try {
        gatewayRefund = await this.razorpay.payments.refund(
          payment.gatewayPaymentId,
          {
            amount: payment.amount,
          },
        );
      } catch (fallbackErr) {
        throw new AppError(
          500,
          "PAYMENT_GATEWAY_ERROR",
          "Failed to initiate refund with gateway",
          { originalError: err.message || fallbackErr.message },
        );
      }
    }

    // Atomically update payment and delete job application inside transaction
    return this.db.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: "REFUNDED",
          gatewayRefundId: gatewayRefund.id,
          refundedAt: new Date(),
        },
      });

      // Try deleting application if it exists
      try {
        await tx.application.delete({
          where: {
            jobId_userId: {
              jobId: payment.jobId,
              userId: payment.userId,
            },
          },
        });
      } catch {
        // If application was already deleted or doesn't exist, we can ignore this error
      }

      return updatedPayment;
    });
  }

  async reconcilePayments(dateString) {
    const targetDate = dateString ? new Date(dateString) : new Date();

    // Set range to cover the entire day (UTC)
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 1. Fetch from Database
    const dbPayments = await this.db.payment.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // 2. Fetch from Razorpay
    const from = Math.floor(startOfDay.getTime() / 1000);
    const to = Math.floor(endOfDay.getTime() / 1000);

    let gatewayPayments = [];
    try {
      const rzpResponse = await this.razorpay.payments.all({
        from,
        to,
        count: 100,
      });
      gatewayPayments = rzpResponse.items || rzpResponse || [];
    } catch (err) {
      throw new AppError(
        500,
        "PAYMENT_GATEWAY_ERROR",
        "Failed to fetch payment list from gateway",
        { originalError: err.message },
      );
    }

    // Create lookup map of gateway payments by id and order_id
    const rzpPayMap = new Map();
    const rzpOrderMap = new Map();
    for (const p of gatewayPayments) {
      rzpPayMap.set(p.id, p);
      if (p.order_id) {
        rzpOrderMap.set(p.order_id, p);
      }
    }

    const discrepancies = [];
    let reconciledCount = 0;
    let totalAmountDb = 0;
    let totalAmountGateway = 0;

    // Build sums for matching status (completed/captured)
    for (const dbPay of dbPayments) {
      if (dbPay.status === "COMPLETED") {
        totalAmountDb += dbPay.amount;
      }
    }

    for (const rzpPay of gatewayPayments) {
      if (rzpPay.status === "captured") {
        totalAmountGateway += rzpPay.amount;
      }
    }

    // Track which gateway payments we match
    const matchedRzpIds = new Set();

    // Loop DB payments and match
    for (const dbPay of dbPayments) {
      // Find matching gateway payment
      let rzpPay = null;
      if (dbPay.gatewayPaymentId) {
        rzpPay = rzpPayMap.get(dbPay.gatewayPaymentId);
      } else if (dbPay.gatewayOrderId) {
        rzpPay = rzpOrderMap.get(dbPay.gatewayOrderId);
      }

      if (!rzpPay) {
        // If status is not PENDING/FAILED, then missing on gateway is a real discrepancy
        if (dbPay.status === "COMPLETED" || dbPay.status === "REFUNDED") {
          discrepancies.push({
            paymentId: dbPay.id,
            gatewayPaymentId: dbPay.gatewayPaymentId || null,
            gatewayOrderId: dbPay.gatewayOrderId,
            type: "MISSING_ON_GATEWAY",
            details: {
              dbStatus: dbPay.status,
              dbAmount: dbPay.amount,
              gatewayStatus: null,
              gatewayAmount: null,
              failureReason: dbPay.failureReason || null,
            },
          });
        }
        continue;
      }

      matchedRzpIds.add(rzpPay.id);

      // Check amount mismatch
      const amountMismatch = dbPay.amount !== rzpPay.amount;

      // Check status mismatch
      let statusMismatch = false;
      if (dbPay.status === "COMPLETED" && rzpPay.status !== "captured") {
        statusMismatch = true;
      } else if (dbPay.status === "REFUNDED" && rzpPay.status !== "refunded") {
        statusMismatch = true;
      } else if (dbPay.status === "FAILED" && rzpPay.status === "captured") {
        statusMismatch = true;
      } else if (dbPay.status === "PENDING" && rzpPay.status === "captured") {
        statusMismatch = true;
      }

      if (amountMismatch || statusMismatch) {
        discrepancies.push({
          paymentId: dbPay.id,
          gatewayPaymentId: rzpPay.id,
          gatewayOrderId: dbPay.gatewayOrderId,
          type: amountMismatch ? "AMOUNT_MISMATCH" : "STATUS_MISMATCH",
          details: {
            dbStatus: dbPay.status,
            dbAmount: dbPay.amount,
            gatewayStatus: rzpPay.status,
            gatewayAmount: rzpPay.amount,
            failureReason: dbPay.failureReason || null,
          },
        });
      } else {
        reconciledCount++;
      }
    }

    // Find gateway payments missing in DB (captured payments missing in DB)
    for (const rzpPay of gatewayPayments) {
      if (rzpPay.status === "captured" && !matchedRzpIds.has(rzpPay.id)) {
        discrepancies.push({
          paymentId: null,
          gatewayPaymentId: rzpPay.id,
          gatewayOrderId: rzpPay.order_id || null,
          type: "MISSING_IN_DB",
          details: {
            dbStatus: null,
            dbAmount: null,
            gatewayStatus: rzpPay.status,
            gatewayAmount: rzpPay.amount,
            failureReason: null,
          },
        });
      }
    }

    const formattedDate = startOfDay.toISOString().slice(0, 10);

    return {
      date: formattedDate,
      reconciliationStatus:
        discrepancies.length > 0 ? "DISCREPANCY_FOUND" : "MATCHED",
      totalAmountDb,
      totalAmountGateway,
      dbCount: dbPayments.length,
      gatewayCount: gatewayPayments.length,
      reconciledCount,
      discrepancyCount: discrepancies.length,
      discrepancies,
    };
  }

  async handleWebhook(payload, signature) {
    // 1. Verify webhook signature
    const secret = config.RAZORPAY_WEBHOOK_SECRET;
    const bodyString =
      typeof payload === "string" ? payload : JSON.stringify(payload);

    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(bodyString);
    const expectedSignature = hmac.digest("hex");

    if (expectedSignature !== signature) {
      throw new AppError(
        400,
        "INVALID_SIGNATURE",
        "Webhook signature verification failed",
      );
    }

    // Parse the payload if it was a string
    const eventObj =
      typeof payload === "string" ? JSON.parse(payload) : payload;
    const event = eventObj.event;

    if (event === "payment.captured") {
      const entity = eventObj.payload?.payment?.entity;
      if (!entity) return { received: true };

      const gatewayOrderId = entity.order_id;
      const gatewayPaymentId = entity.id;

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

      // Process only if pending
      if (payment && payment.status === "PENDING") {
        if (
          entity.amount !== payment.amount ||
          entity.currency !== payment.currency
        ) {
          await this.db.payment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              gatewayPaymentId,
              gatewaySignature: signature,
              failureReason: "Webhook payment amount or currency mismatch",
            },
          });
          throw new AppError(
            400,
            "PAYMENT_AMOUNT_MISMATCH",
            "Webhook payment amount or currency mismatch",
          );
        }

        try {
          // Safety checks
          if (payment.job.company?.status === "SUSPENDED") {
            throw new ForbiddenError("This company is suspended");
          }

          const existing = await this.db.application.findUnique({
            where: {
              jobId_userId: { jobId: payment.jobId, userId: payment.userId },
            },
          });

          if (existing) {
            throw new ConflictError("You have already applied to this job");
          }

          const skills = JSON.parse(payment.skillsJson);

          // Complete payment and create application atomically
          await this.db.$transaction(async (tx) => {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: "COMPLETED",
                gatewayPaymentId,
                gatewaySignature: signature,
              },
            });

            await tx.application.create({
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
            });
          });
        } catch (err) {
          // Webhook capture failed at business logic or db level, but payment was captured on Razorpay
          let refundError = null;
          let gatewayRefund = null;

          try {
            gatewayRefund = await this.razorpay.refunds.create({
              payment_id: gatewayPaymentId,
              amount: payment.amount,
            });
          } catch (refErr) {
            try {
              gatewayRefund = await this.razorpay.payments.refund(
                gatewayPaymentId,
                { amount: payment.amount },
              );
            } catch (fallbackRefErr) {
              refundError = refErr.message || fallbackRefErr.message;
            }
          }

          const failureReason = `Webhook processing failed: ${err.message}.${refundError ? ` Auto-refund failed: ${refundError}` : ""}`;

          await this.db.payment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              gatewayPaymentId,
              gatewaySignature: signature,
              failureReason,
              gatewayRefundId: gatewayRefund?.id || null,
              refundedAt: gatewayRefund ? new Date() : null,
            },
          });

          throw err;
        }
      }
    } else if (event === "payment.failed") {
      const entity = eventObj.payload?.payment?.entity;
      if (!entity) return { received: true };

      const gatewayOrderId = entity.order_id;
      const payment = await this.db.payment.findUnique({
        where: { gatewayOrderId },
      });

      if (payment && payment.status === "PENDING") {
        const failureReason = entity.error_description || entity.error_code || "Payment failed on gateway";
        await this.db.payment.update({
          where: { id: payment.id },
          data: {
            status: "FAILED",
            failureReason,
          },
        });
      }
    }

    return { received: true };
  }

  async getRevenueDashboard(userId, query) {
    const { companyId, startDate, endDate } = query;

    if (companyId) {
      // 1. Verify company exists and user is a member
      const membership = await this.db.companyMembership.findUnique({
        where: {
          userId_companyId: { userId, companyId },
        },
        select: {
          role: true,
          company: {
            select: { status: true },
          },
        },
      });

      if (!membership) {
        throw new NotFoundError("Company not found");
      }

      if (membership.company?.status === "SUSPENDED") {
        throw new ForbiddenError("This company is suspended");
      }
    }

    // 2. Build where filter for payments
    const where = {};
    if (companyId) {
      where.job = { companyId };
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // 3. Fetch matching payments
    const payments = await this.db.payment.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // 4. Calculate metrics
    let totalRevenue = 0;
    let totalRefunded = 0;
    let totalTransactions = payments.length;
    let completedCount = 0;
    let refundedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    const jobMap = new Map();
    const dailyMap = new Map();

    for (const p of payments) {
      if (p.status === "COMPLETED") {
        totalRevenue += p.amount;
        completedCount++;
      } else if (p.status === "REFUNDED") {
        totalRefunded += p.amount;
        refundedCount++;
      } else if (p.status === "FAILED") {
        failedCount++;
      } else if (p.status === "PENDING") {
        pendingCount++;
      }

      // Aggregate by Job
      const jobId = p.jobId;
      if (!jobMap.has(jobId)) {
        jobMap.set(jobId, {
          jobId,
          title: p.job.title,
          companyName: p.job.company.displayName,
          totalRevenue: 0,
          totalRefunded: 0,
          netRevenue: 0,
          applicationCount: 0,
        });
      }
      const jobStats = jobMap.get(jobId);
      if (p.status === "COMPLETED") {
        jobStats.totalRevenue += p.amount;
        jobStats.netRevenue += p.amount;
        jobStats.applicationCount++;
      } else if (p.status === "REFUNDED") {
        jobStats.totalRefunded += p.amount;
        jobStats.netRevenue -= p.amount;
      }

      // Populate dailyMap with activity
      const dateStr = p.createdAt.toISOString().slice(0, 10);
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, {
          revenue: 0,
          refunds: 0,
          netRevenue: 0,
          transactionCount: 0,
        });
      }
      const dailyStats = dailyMap.get(dateStr);
      dailyStats.transactionCount++;
      if (p.status === "COMPLETED") {
        dailyStats.revenue += p.amount;
        dailyStats.netRevenue += p.amount;
      } else if (p.status === "REFUNDED") {
        dailyStats.refunds += p.amount;
        dailyStats.netRevenue -= p.amount;
      }
    }

    // Generate full timeline for daily trends (fills quiet days with 0s)
    let datesInRange = [];
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 29); // 30 days ago
    
    const start = startDate ? new Date(startDate) : (payments.length > 0 ? payments[0].createdAt : defaultStartDate);
    const end = endDate ? new Date(endDate) : new Date();

    const current = new Date(start);
    current.setUTCHours(12, 0, 0, 0);
    const limit = new Date(end);
    limit.setUTCHours(12, 0, 0, 0);

    while (current <= limit) {
      datesInRange.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const dailyTrends = datesInRange.map((dateStr) => {
      const stats = dailyMap.get(dateStr) || {
        revenue: 0,
        refunds: 0,
        netRevenue: 0,
        transactionCount: 0,
      };
      return {
        date: dateStr,
        ...stats,
      };
    });

    const jobBreakdown = Array.from(jobMap.values()).sort(
      (a, b) => b.netRevenue - a.netRevenue,
    );

    return {
      summary: {
        totalRevenue,
        totalRefunded,
        netRevenue: totalRevenue - totalRefunded,
        totalTransactions,
        completedCount,
        refundedCount,
        failedCount,
        pendingCount,
      },
      jobBreakdown,
      dailyTrends,
    };
  }
}
