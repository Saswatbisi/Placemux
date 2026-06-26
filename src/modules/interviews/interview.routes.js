import {
  createInterviewSchema,
  updateInterviewSchema,
  interviewIdParamsSchema,
  companyApplicationParamsSchema,
  applicationIdParamsSchema,
} from "./interview.schemas.js";
import { InterviewService } from "./interview.service.js";

export function interviewRoutes(db) {
  return async (app) => {
    const service = new InterviewService(db);

    app.addHook("onRequest", app.authenticate);

    // POST /api/v1/companies/:companyId/applications/:applicationId/interviews
    app.post(
      "/companies/:companyId/applications/:applicationId/interviews",
      async (request, reply) => {
        const { companyId, applicationId } = companyApplicationParamsSchema.parse(
          request.params,
        );
        const input = createInterviewSchema.parse(request.body);
        const interview = await service.scheduleInterview(
          companyId,
          request.user.userId,
          applicationId,
          input,
        );
        return reply.code(201).send({ data: interview });
      },
    );

    // GET /api/v1/applications/:applicationId/interviews
    app.get("/applications/:applicationId/interviews", async (request) => {
      const { applicationId } = applicationIdParamsSchema.parse(request.params);
      const interviews = await service.getInterviewsForApplication(
        request.user.userId,
        applicationId,
      );
      return { data: interviews };
    });

    // GET /api/v1/interviews/:id
    app.get("/interviews/:id", async (request) => {
      const { id } = interviewIdParamsSchema.parse(request.params);
      const interview = await service.getInterview(request.user.userId, id);
      return { data: interview };
    });

    // PATCH /api/v1/interviews/:id
    app.patch("/interviews/:id", async (request) => {
      const { id } = interviewIdParamsSchema.parse(request.params);
      const input = updateInterviewSchema.parse(request.body);
      const interview = await service.updateInterview(
        request.user.userId,
        id,
        input,
      );
      return { data: interview };
    });
  };
}
