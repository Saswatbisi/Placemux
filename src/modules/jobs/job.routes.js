import { config } from "../../config.js";
import {
  assessmentParamsSchema,
  companyJobParamsSchema,
  createJobSchema,
} from "./job.schemas.js";
import { JobService } from "./job.service.js";

export function jobRoutes(db) {
  return async (app) => {
    const service = new JobService(db, config.API_PUBLIC_URL);

    app.post(
      "/companies/:companyId/jobs",
      { onRequest: app.authenticate },
      async (request, reply) => {
        const { companyId } = companyJobParamsSchema.parse(request.params);
        const input = createJobSchema.parse(request.body);
        const job = await service.createJob(
          companyId,
          request.user.userId,
          input,
        );

        return reply.code(201).send({ data: job });
      },
    );

    app.get("/assessments/:token", async (request) => {
      const { token } = assessmentParamsSchema.parse(request.params);
      const assessment = await service.getAssessment(token);
      return { data: assessment };
    });
  };
}
