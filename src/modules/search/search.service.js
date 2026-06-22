/**
 * SearchService
 * --------------------------------------------------------------------------
 * Provides full-text keyword search, multi-facet filtering, relevance ranking,
 * and discovery helpers (recent jobs, skill facets, location facets).
 *
 * Relevance ranking strategy (all in-app, no Atlas Search dependency):
 *   - Title match boost   → +3 points per keyword hit
 *   - Location match boost → +2 points
 *   - Description match    → +1 point
 *   - Recency boost        → extra weight for jobs published in the last 7 days
 */

import { config } from "../../config.js";

const JOB_SELECT = {
  id: true,
  companyId: true,
  title: true,
  description: true,
  location: true,
  employmentType: true,
  workplaceType: true,
  status: true,
  assessmentToken: true,
  company: {
    select: {
      id: true,
      displayName: true,
      status: true,
      profile: {
        select: {
          logoUrl: true,
          city: true,
          state: true,
        },
      },
    },
  },
  skillThresholds: {
    select: {
      id: true,
      skill: true,
      skillKey: true,
      minimumLevel: true,
    },
  },
  createdAt: true,
  updatedAt: true,
};

export class SearchService {
  constructor(db) {
    this.db = db;
    this.apiPublicUrl = config.API_PUBLIC_URL.replace(/\/+$/, "");
  }

  // ---------- Search jobs ----------

  async searchJobs(query) {
    const {
      q,
      employmentType,
      workplaceType,
      status,
      location,
      skills,
      companyId,
      sortBy,
      sortOrder,
      cursor,
      limit,
    } = query;

    // ---- Build Prisma where clause ----
    const where = {
      status,
      company: {
        status: { not: "SUSPENDED" },
      },
    };

    if (employmentType?.length) {
      where.employmentType = { in: employmentType };
    }
    if (workplaceType?.length) {
      where.workplaceType = { in: workplaceType };
    }
    if (companyId) {
      where.companyId = companyId;
    }
    if (location) {
      where.location = { contains: location, mode: "insensitive" };
    }
    if (skills?.length) {
      where.skillThresholds = {
        some: {
          skillKey: { in: skills },
        },
      };
    }

    // For keyword search we do a broad OR across title/description/location
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
      ];
    }

    // ---- Pagination ----
    const findArgs = {
      where,
      select: JOB_SELECT,
      take: limit + 1, // fetch one extra to know if there is a next page
    };

    if (cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: cursor };
    }

    // ---- Sorting (non-relevance) ----
    if (sortBy === "createdAt") {
      findArgs.orderBy = { createdAt: sortOrder };
    } else if (sortBy === "title") {
      findArgs.orderBy = { title: sortOrder };
    } else {
      // relevance — fetch ordered by createdAt desc, rank in-app
      findArgs.orderBy = { createdAt: "desc" };
    }

    let jobs = await this.db.job.findMany(findArgs);

    // ---- Relevance ranking ----
    if (sortBy === "relevance" && q) {
      jobs = this.#rankByRelevance(jobs, q);
    }

    // ---- Pagination metadata ----
    const hasNextPage = jobs.length > limit;
    if (hasNextPage) jobs.pop();
    const nextCursor = hasNextPage ? jobs[jobs.length - 1].id : null;

    // ---- Shape response ----
    const items = jobs.map((job) => this.#formatJob(job));

    return {
      items,
      pagination: {
        limit,
        hasNextPage,
        nextCursor,
        total: items.length,
      },
    };
  }

  // ---------- Single job detail ----------

  async getJobById(jobId) {
    const job = await this.db.job.findUnique({
      where: { id: jobId },
      select: JOB_SELECT,
    });

    if (!job || job.status !== "PUBLISHED" || job.company.status === "SUSPENDED") {
      return null;
    }

    return this.#formatJob(job);
  }

  // ---------- Discovery: recent jobs ----------

  async getRecentJobs(query) {
    const { limit, cursor } = query;

    const findArgs = {
      where: {
        status: "PUBLISHED",
        company: { status: { not: "SUSPENDED" } },
      },
      select: JOB_SELECT,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    };

    if (cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: cursor };
    }

    let jobs = await this.db.job.findMany(findArgs);

    const hasNextPage = jobs.length > limit;
    if (hasNextPage) jobs.pop();
    const nextCursor = hasNextPage ? jobs[jobs.length - 1].id : null;

    return {
      items: jobs.map((job) => this.#formatJob(job)),
      pagination: { limit, hasNextPage, nextCursor, total: jobs.length },
    };
  }

  // ---------- Discovery: skill facets ----------

  async getSkillFacets(query) {
    const { limit } = query;

    // Aggregate distinct skills from published jobs
    const thresholds = await this.db.jobSkillThreshold.findMany({
      where: {
        job: {
          status: "PUBLISHED",
          company: { status: { not: "SUSPENDED" } },
        },
      },
      select: {
        skill: true,
        skillKey: true,
      },
    });

    // Count occurrences of each skill
    const skillMap = new Map();
    for (const { skill, skillKey } of thresholds) {
      if (!skillMap.has(skillKey)) {
        skillMap.set(skillKey, { skill, skillKey, count: 0 });
      }
      skillMap.get(skillKey).count += 1;
    }

    // Sort by count descending
    const facets = [...skillMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return { items: facets, total: skillMap.size };
  }

  // ---------- Discovery: location facets ----------

  async getLocationFacets(query) {
    const { limit } = query;

    const jobs = await this.db.job.findMany({
      where: {
        status: "PUBLISHED",
        company: { status: { not: "SUSPENDED" } },
      },
      select: { location: true },
    });

    const locationMap = new Map();
    for (const { location } of jobs) {
      const key = location.toLocaleLowerCase("en-IN");
      if (!locationMap.has(key)) {
        locationMap.set(key, { location, count: 0 });
      }
      locationMap.get(key).count += 1;
    }

    const facets = [...locationMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return { items: facets, total: locationMap.size };
  }

  // ---------- Discovery: employment-type breakdown ----------

  async getEmploymentTypeFacets() {
    const jobs = await this.db.job.findMany({
      where: {
        status: "PUBLISHED",
        company: { status: { not: "SUSPENDED" } },
      },
      select: { employmentType: true },
    });

    const counts = {};
    for (const { employmentType } of jobs) {
      counts[employmentType] = (counts[employmentType] || 0) + 1;
    }

    const items = Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return { items, total: items.length };
  }

  // ========== Private helpers ==========

  /**
   * Rank an array of jobs by keyword relevance.
   * Title matches are weighted highest, then location, then description.
   * Recent jobs (≤ 7 days) receive a recency boost.
   */
  #rankByRelevance(jobs, keyword) {
    const terms = keyword
      .toLocaleLowerCase("en-IN")
      .split(/\s+/)
      .filter(Boolean);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const scored = jobs.map((job) => {
      let score = 0;

      const title = job.title.toLocaleLowerCase("en-IN");
      const location = job.location.toLocaleLowerCase("en-IN");
      const description = job.description.toLocaleLowerCase("en-IN");

      for (const term of terms) {
        if (title.includes(term)) score += 3;
        if (location.includes(term)) score += 2;
        if (description.includes(term)) score += 1;
      }

      // Recency boost
      if (new Date(job.createdAt).getTime() >= sevenDaysAgo) {
        score += 1;
      }

      return { job, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(({ job }) => job);
  }

  #formatJob(job) {
    return {
      ...job,
      assessmentUrl: `${this.apiPublicUrl}/api/v1/assessments/${job.assessmentToken}`,
    };
  }
}
