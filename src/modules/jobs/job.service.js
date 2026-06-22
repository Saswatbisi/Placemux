import { randomUUID } from "node:crypto";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";

const jobSelection = {
  id: true,
  companyId: true,
  title: true,
  description: true,
  location: true,
  employmentType: true,
  workplaceType: true,
  status: true,
  assessmentToken: true,
  skillThresholds: {
    select: {
      id: true,
      skill: true,
      minimumLevel: true,
    },
  },
  createdAt: true,
  updatedAt: true,
};

export class JobService {
  constructor(db, apiPublicUrl) {
    this.db = db;
    this.apiPublicUrl = apiPublicUrl.replace(/\/+$/, "");
  }

  assessmentUrl(token) {
    return `${this.apiPublicUrl}/api/v1/assessments/${token}`;
  }

  async requirePublisher(companyId, userId) {
    const membership = await this.db.companyMembership.findUnique({
      where: {
        userId_companyId: { userId, companyId },
      },
      select: {
        role: true,
        company: {
          select: { status: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundError("Company not found");
    }
    if (membership.company?.status === "SUSPENDED") {
      throw new ForbiddenError("This company is suspended");
    }
    if (!["OWNER", "ADMIN"].includes(membership.role)) {
      throw new ForbiddenError("Only company owners and admins can post jobs");
    }
  }

  async createJob(companyId, userId, input) {
    await this.requirePublisher(companyId, userId);

    const assessmentToken = randomUUID();
    const skillThresholds = input.skillThresholds.map((threshold) => ({
      skill: threshold.skill.trim(),
      skillKey: threshold.skill.trim().toLocaleLowerCase("en-IN"),
      minimumLevel: threshold.minimumLevel,
    }));

    const job = await this.db.job.create({
      data: {
        companyId,
        title: input.title.trim(),
        description: input.description.trim(),
        location: input.location.trim(),
        employmentType: input.employmentType,
        workplaceType: input.workplaceType,
        assessmentToken,
        skillThresholds: {
          create: skillThresholds,
        },
      },
      select: jobSelection,
    });

    return {
      ...job,
      assessmentUrl: this.assessmentUrl(job.assessmentToken),
    };
  }

  async getAssessment(token) {
    const job = await this.db.job.findUnique({
      where: { assessmentToken: token },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        employmentType: true,
        workplaceType: true,
        status: true,
        company: {
          select: {
            id: true,
            displayName: true,
          },
        },
        skillThresholds: {
          select: {
            id: true,
            skill: true,
            minimumLevel: true,
          },
        },
        createdAt: true,
      },
    });

    if (!job || job.status !== "PUBLISHED") {
      throw new NotFoundError("Assessment not found");
    }

    return job;
  }
}
