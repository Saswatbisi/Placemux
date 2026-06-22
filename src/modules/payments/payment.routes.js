import { checkoutSchema, verifyPaymentSchema } from "./payment.schemas.js";
import { PaymentService } from "./payment.service.js";

export function paymentRoutes(db, razorpayClient = null) {
  return async (app) => {
    const service = new PaymentService(db, razorpayClient);

    app.addHook("onRequest", app.authenticate);

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
  };
}
