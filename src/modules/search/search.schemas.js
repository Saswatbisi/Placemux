import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a MongoDB ObjectId");

/**
 * Query-string schema for the main search endpoint
 * GET /api/v1/search/jobs?q=…&employmentType=…&workplaceType=…&…
 */
export const searchJobsQuerySchema = z.object({
  // Free-text keyword search (matched against title, description, location)
  q: z.string().trim().max(200).optional(),

  // Enum filters (supports comma-separated for multi-select)
  employmentType: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim().toUpperCase()))
    .pipe(
      z.array(
        z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"]),
      ),
    )
    .optional(),
  workplaceType: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim().toUpperCase()))
    .pipe(z.array(z.enum(["ONSITE", "HYBRID", "REMOTE"])))
    .optional(),
  status: z.enum(["PUBLISHED", "CLOSED"]).optional().default("PUBLISHED"),

  // Location filter (case-insensitive contains)
  location: z.string().trim().max(120).optional(),

  // Skill filter (comma-separated skill keys)
  skills: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim().toLocaleLowerCase("en-IN"))
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1)).max(20))
    .optional(),

  // Company filter
  companyId: objectIdSchema.optional(),

  // Sorting
  sortBy: z
    .enum(["relevance", "createdAt", "title"])
    .optional()
    .default("relevance"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),

  // Cursor-based pagination
  cursor: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();

/**
 * Query-string schema for the discovery / explore endpoints
 * GET /api/v1/discover/recent
 * GET /api/v1/discover/skills
 * GET /api/v1/discover/locations
 */
export const discoverRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  cursor: objectIdSchema.optional(),
});

export const discoverFacetQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

/**
 * Params schema for single-job detail via search module
 * GET /api/v1/search/jobs/:jobId
 */
export const jobIdParamsSchema = z.object({
  jobId: objectIdSchema,
});
