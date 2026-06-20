import { NotFoundError } from "../../lib/errors.js";
import {
  discoverFacetQuerySchema,
  discoverRecentQuerySchema,
  jobIdParamsSchema,
  searchJobsQuerySchema,
} from "./search.schemas.js";
import { SearchService } from "./search.service.js";

export function searchRoutes(db) {
  return async (app) => {
    const service = new SearchService(db);

    // ──────────────────────────────
    //  Search endpoints
    // ──────────────────────────────

    /**
     * GET /api/v1/search/jobs
     * Full-text keyword search with filters, sorting, and pagination.
     * Public – no auth required.
     */
    app.get("/search/jobs", async (request, reply) => {
      try {
        const query = searchJobsQuerySchema.parse(request.query);
        const result = await service.searchJobs(query);
        return { data: result };
      } catch (err) {
        request.log.error(err, "Search jobs failed");
        throw err;
      }
    });

    /**
     * GET /api/v1/search/jobs/:jobId
     * Retrieve a single published job by ID.
     * Public – no auth required.
     */
    app.get("/search/jobs/:jobId", async (request) => {
      const { jobId } = jobIdParamsSchema.parse(request.params);
      const job = await service.getJobById(jobId);
      if (!job) {
        throw new NotFoundError("Job not found");
      }
      return { data: job };
    });

    // ──────────────────────────────
    //  Discovery endpoints
    // ──────────────────────────────

    /**
     * GET /api/v1/discover/recent
     * Latest published jobs.
     * Public – no auth required.
     */
    app.get("/discover/recent", async (request) => {
      const query = discoverRecentQuerySchema.parse(request.query);
      const result = await service.getRecentJobs(query);
      return { data: result };
    });

    /**
     * GET /api/v1/discover/skills
     * Skill facets with job counts (top skills across published jobs).
     * Public – no auth required.
     */
    app.get("/discover/skills", async (request) => {
      const query = discoverFacetQuerySchema.parse(request.query);
      const result = await service.getSkillFacets(query);
      return { data: result };
    });

    /**
     * GET /api/v1/discover/locations
     * Location facets with job counts.
     * Public – no auth required.
     */
    app.get("/discover/locations", async (request) => {
      const query = discoverFacetQuerySchema.parse(request.query);
      const result = await service.getLocationFacets(query);
      return { data: result };
    });

    /**
     * GET /api/v1/discover/employment-types
     * Employment type breakdown with counts.
     * Public – no auth required.
     */
    app.get("/discover/employment-types", async (request) => {
      const result = await service.getEmploymentTypeFacets();
      return { data: result };
    });
  };
}
