import {
  checkoutSchema,
  verifyPaymentSchema,
  paymentIdParamsSchema,
  reconciliationQuerySchema,
  dashboardQuerySchema,
} from "./payment.schemas.js";
import { PaymentService } from "./payment.service.js";

export function paymentRoutes(db, razorpayClient = null) {
  return async (app) => {
    const service = new PaymentService(db, razorpayClient);

    app.addHook("onRequest", async (request, reply) => {
      if (request.url.endsWith("/webhook")) {
        return;
      }
      await app.authenticate(request, reply);
    });

    // POST /api/v1/payments/checkout
    app.post("/checkout", async (request, reply) => {
      const input = checkoutSchema.parse(request.body);
      const result = await service.createCheckoutOrder(
        request.user.userId,
        input.jobId,
        input,
      );
      return reply.code(201).send({ data: result });
    });

    // POST /api/v1/payments/verify
    app.post("/verify", async (request) => {
      const payload = verifyPaymentSchema.parse(request.body);
      const application = await service.verifyPayment(
        request.user.userId,
        payload,
      );
      return { data: application };
    });

    // POST /api/v1/payments/webhook
    app.post("/webhook", async (request, reply) => {
      const signature = request.headers["x-razorpay-signature"];
      if (!signature) {
        return reply.code(400).send({
          error: {
            code: "MISSING_SIGNATURE",
            message: "x-razorpay-signature header is required",
            requestId: request.id,
          },
        });
      }
      const result = await service.handleWebhook(request.body, signature);
      return reply.code(200).send(result);
    });

    // GET /api/v1/payments/reconciliation
    app.get("/reconciliation", async (request) => {
      const query = reconciliationQuerySchema.parse(request.query);
      const result = await service.reconcilePayments(query.date);
      return { data: result };
    });

    // GET /api/v1/payments/dashboard
    app.get("/dashboard", async (request) => {
      const query = dashboardQuerySchema.parse(request.query);
      const result = await service.getRevenueDashboard(
        request.user.userId,
        query,
      );
      return { data: result };
    });

    // GET /api/v1/payments/:id/receipt
    app.get("/:id/receipt", async (request) => {
      const { id } = paymentIdParamsSchema.parse(request.params);
      const result = await service.getReceipt(request.user.userId, id);
      return { data: result };
    });

    // POST /api/v1/payments/:id/refund
    app.post("/:id/refund", async (request) => {
      const { id } = paymentIdParamsSchema.parse(request.params);
      const result = await service.refundPayment(request.user.userId, id);
      return { data: result };
    });
  };
}
