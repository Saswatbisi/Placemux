import {
  createOfferSchema,
  signOfferSchema,
  offerIdParamsSchema,
  generateOfferParamsSchema,
} from "./offer.schemas.js";
import { OfferService } from "./offer.service.js";

export function offerRoutes(db) {
  return async (app) => {
    const service = new OfferService(db);

    app.addHook("onRequest", app.authenticate);

    // POST /api/v1/companies/:companyId/applications/:applicationId/offers
    app.post(
      "/companies/:companyId/applications/:applicationId/offers",
      async (request, reply) => {
        const { companyId, applicationId } = generateOfferParamsSchema.parse(
          request.params,
        );
        const input = createOfferSchema.parse(request.body);
        const offer = await service.createOffer(
          companyId,
          request.user.userId,
          applicationId,
          input,
        );
        return reply.code(201).send({ data: offer });
      },
    );

    // GET /api/v1/offers/:id
    app.get("/offers/:id", async (request) => {
      const { id } = offerIdParamsSchema.parse(request.params);
      const offer = await service.getOffer(request.user.userId, id);
      return { data: offer };
    });

    // POST /api/v1/offers/:id/sign
    app.post("/offers/:id/sign", async (request) => {
      const { id } = offerIdParamsSchema.parse(request.params);
      const input = signOfferSchema.parse(request.body);
      const ipAddress = request.ip || "127.0.0.1";
      const offer = await service.signOffer(
        request.user.userId,
        id,
        input,
        ipAddress,
      );
      return { data: offer };
    });

    // GET /api/v1/offers/:id/verify
    app.get("/offers/:id/verify", async (request) => {
      const { id } = offerIdParamsSchema.parse(request.params);
      const verification = await service.verifyOffer(id);
      return { data: verification };
    });
  };
}
