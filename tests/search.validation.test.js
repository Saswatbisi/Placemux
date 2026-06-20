import { describe, expect, it } from "vitest";
import {
  discoverFacetQuerySchema,
  discoverRecentQuerySchema,
  jobIdParamsSchema,
  searchJobsQuerySchema,
} from "../src/modules/search/search.schemas.js";

describe("searchJobsQuerySchema", () => {
  it("accepts an empty query (returns defaults)", () => {
    const result = searchJobsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.status).toBe("PUBLISHED");
    expect(result.data.sortBy).toBe("relevance");
    expect(result.data.sortOrder).toBe("desc");
    expect(result.data.limit).toBe(20);
  });

  it("parses keyword search", () => {
    const result = searchJobsQuerySchema.safeParse({ q: "React Developer" });
    expect(result.success).toBe(true);
    expect(result.data.q).toBe("React Developer");
  });

  it("parses comma-separated employment types", () => {
    const result = searchJobsQuerySchema.safeParse({
      employmentType: "FULL_TIME,INTERNSHIP",
    });
    expect(result.success).toBe(true);
    expect(result.data.employmentType).toEqual(["FULL_TIME", "INTERNSHIP"]);
  });

  it("parses comma-separated workplace types", () => {
    const result = searchJobsQuerySchema.safeParse({
      workplaceType: "REMOTE,HYBRID",
    });
    expect(result.success).toBe(true);
    expect(result.data.workplaceType).toEqual(["REMOTE", "HYBRID"]);
  });

  it("parses comma-separated skills and lowercases them", () => {
    const result = searchJobsQuerySchema.safeParse({
      skills: "React,Node.js,TypeScript",
    });
    expect(result.success).toBe(true);
    expect(result.data.skills).toEqual(["react", "node.js", "typescript"]);
  });

  it("accepts valid sort options", () => {
    const result = searchJobsQuerySchema.safeParse({
      sortBy: "createdAt",
      sortOrder: "asc",
    });
    expect(result.success).toBe(true);
    expect(result.data.sortBy).toBe("createdAt");
    expect(result.data.sortOrder).toBe("asc");
  });

  it("accepts cursor-based pagination", () => {
    const result = searchJobsQuerySchema.safeParse({
      cursor: "507f1f77bcf86cd799439011",
      limit: "10",
    });
    expect(result.success).toBe(true);
    expect(result.data.cursor).toBe("507f1f77bcf86cd799439011");
    expect(result.data.limit).toBe(10);
  });

  it("rejects invalid employment types", () => {
    const result = searchJobsQuerySchema.safeParse({
      employmentType: "FREELANCE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit exceeding 50", () => {
    const result = searchJobsQuerySchema.safeParse({ limit: "100" });
    expect(result.success).toBe(false);
  });

  it("rejects extra properties (strict mode)", () => {
    const result = searchJobsQuerySchema.safeParse({ unknown: "value" });
    expect(result.success).toBe(false);
  });
});

describe("discoverRecentQuerySchema", () => {
  it("defaults limit to 10", () => {
    const result = discoverRecentQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(10);
  });

  it("parses cursor and limit", () => {
    const result = discoverRecentQuerySchema.safeParse({
      cursor: "507f1f77bcf86cd799439011",
      limit: "5",
    });
    expect(result.success).toBe(true);
    expect(result.data.cursor).toBe("507f1f77bcf86cd799439011");
    expect(result.data.limit).toBe(5);
  });
});

describe("discoverFacetQuerySchema", () => {
  it("defaults limit to 25", () => {
    const result = discoverFacetQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(25);
  });

  it("rejects limit over 100", () => {
    const result = discoverFacetQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });
});

describe("jobIdParamsSchema", () => {
  it("accepts a valid ObjectId", () => {
    const result = jobIdParamsSchema.safeParse({
      jobId: "507f1f77bcf86cd799439011",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid ObjectId", () => {
    const result = jobIdParamsSchema.safeParse({ jobId: "not-an-id" });
    expect(result.success).toBe(false);
  });
});
