import {
  companyIdParamsSchema,
  submitKycSchema,
  updateProfileSchema,
} from "./company.schemas.js";
import { CompanyService } from "./company.service.js";

export function companyRoutes(db) {
  return async (app) => {
    const service = new CompanyService(db);

    app.addHook("onRequest", app.authenticate);

    app.get("/:id", async (request) => {
      const { id } = companyIdParamsSchema.parse(request.params);
      const company = await service.getCompany(id, request.user.userId);
      return { data: company };
    });

    app.patch("/:id/profile", async (request) => {
      const { id } = companyIdParamsSchema.parse(request.params);
      const input = updateProfileSchema.parse(request.body);
      const profile = await service.updateProfile(
        id,
        request.user.userId,
        input,
      );
      return { data: profile };
    });

    app.post("/:id/kyc", async (request, reply) => {
      const { id } = companyIdParamsSchema.parse(request.params);
      const input = submitKycSchema.parse(request.body);
      const kyc = await service.submitKyc(id, request.user.userId, input);
      return reply.code(202).send({ data: kyc });
    });
  };
}
