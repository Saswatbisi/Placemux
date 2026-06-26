import {
  applyToJobSchema,
  updateApplicationStatusSchema,
  jobIdParamsSchema,
  companyApplicationParamsSchema,
  companyJobParamsSchema,
  applicationIdParamsSchema,
} from "./application.schemas.js";
import { ApplicationService } from "./application.service.js";

export function applicationRoutes(db) {
  return async (app) => {
    const service = new ApplicationService(db);

    app.addHook("onRequest", app.authenticate);

    // POST /api/v1/jobs/:jobId/applications (Student applies to a job)
    app.post("/jobs/:jobId/applications", async (request, reply) => {
      const { jobId } = jobIdParamsSchema.parse(request.params);
      const input = applyToJobSchema.parse(request.body);
      const application = await service.applyToJob(
        jobId,
        request.user.userId,
        input,
      );
      return reply.code(201).send({ data: application });
    });

    // GET /api/v1/applications (Candidate views their own applications)
    app.get("/applications", async (request) => {
      const applications = await service.getCandidateApplications(
        request.user.userId,
      );
      return { data: applications };
    });

    // GET /api/v1/applications/:id (Get application details)
    app.get("/applications/:id", async (request) => {
      const { id } = applicationIdParamsSchema.parse(request.params);
      const application = await service.getApplication(id, request.user.userId);
      return { data: application };
    });

    // GET /api/v1/companies/:companyId/applications (Company views all applications)
    app.get("/companies/:companyId/applications", async (request) => {
      const { companyId } = companyApplicationParamsSchema
        .pick({ companyId: true })
        .parse(request.params);
      const applications = await service.getCompanyApplications(
        companyId,
        request.user.userId,
      );
      return { data: applications };
    });

    // GET /api/v1/companies/:companyId/jobs/:jobId/applications (Company views applications for a specific job)
    app.get(
      "/companies/:companyId/jobs/:jobId/applications",
      async (request) => {
        const { companyId, jobId } = companyJobParamsSchema.parse(
          request.params,
        );
        const applications = await service.getCompanyApplications(
          companyId,
          request.user.userId,
          jobId,
        );
        return { data: applications };
      },
    );

    // PATCH /api/v1/companies/:companyId/applications/:applicationId (Company shortlists or rejects a candidate)
    app.patch(
      "/companies/:companyId/applications/:applicationId",
      async (request) => {
        const { companyId, applicationId } =
          companyApplicationParamsSchema.parse(request.params);
        const { status } = updateApplicationStatusSchema.parse(request.body);
        const application = await service.updateApplicationStatus(
          companyId,
          applicationId,
          request.user.userId,
          status,
        );
        return { data: application };
      },
    );

    // GET /api/v1/applications/:id/status (Fetch unified status tracking)
    app.get("/applications/:id/status", async (request) => {
      const { id } = applicationIdParamsSchema.parse(request.params);
      const statusRecord = await service.getApplicationStatus(
        id,
        request.user.userId,
      );
      return { data: statusRecord };
    });
  };
}
