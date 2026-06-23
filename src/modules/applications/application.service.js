import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

const applicationSelection = {
  id: true,
  jobId: true,
  userId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  candidateSkills: {
    select: {
      id: true,
      skill: true,
      level: true,
    },
  },
  job: {
    select: {
      id: true,
      title: true,
      companyId: true,
      company: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

export class ApplicationService {
  constructor(db) {
    this.db = db;
  }

  async requireMembership(companyId, userId, allowedRoles) {
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
    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenError(
        "You do not have permission to perform this action",
      );
    }
    return membership;
  }

  async applyToJob(jobId, userId, input) {
    const job = await this.db.job.findUnique({
      where: { id: jobId },
      include: {
        skillThresholds: true,
        company: {
          select: { status: true },
        },
      },
    });

    if (!job || job.status !== "PUBLISHED") {
      throw new NotFoundError("Job not found");
    }

    if (job.company?.status === "SUSPENDED") {
      throw new ForbiddenError("This company is suspended");
    }

    const existing = await this.db.application.findUnique({
      where: {
        jobId_userId: { jobId, userId },
      },
    });

    if (existing) {
      throw new ConflictError("You have already applied to this job");
    }

    // Gating check: Ensure there is a completed payment for this user and job
    const completedPayment = await this.db.payment.findFirst({
      where: {
        userId,
        jobId,
        status: "COMPLETED",
      },
    });

    if (!completedPayment) {
      throw new AppError(
        402,
        "PAYMENT_REQUIRED",
        "Payment is required to apply for this job",
      );
    }

    // Verify candidate has submitted levels for all required job skills
    const candidateSkillMap = new Map(
      input.skills.map((s) => [
        s.skill.trim().toLocaleLowerCase("en-IN"),
        s.level,
      ]),
    );

    const missingSkills = [];
    const belowThresholdSkills = [];

    for (const threshold of job.skillThresholds) {
      const candidateLevel = candidateSkillMap.get(threshold.skillKey);
      if (candidateLevel === undefined) {
        missingSkills.push(threshold.skill);
      } else if (candidateLevel < threshold.minimumLevel) {
        belowThresholdSkills.push(
          `${threshold.skill} (requires level ${threshold.minimumLevel}, provided level ${candidateLevel})`,
        );
      }
    }

    if (missingSkills.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Missing required skills: ${missingSkills.join(", ")}`,
        { missingSkills },
      );
    }

    if (belowThresholdSkills.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Skill level is below the minimum required for: ${belowThresholdSkills.join(", ")}`,
        { belowThresholdSkills },
      );
    }

    return this.db.$transaction(async (tx) => {
      return tx.application.create({
        data: {
          jobId,
          userId,
          candidateSkills: {
            create: input.skills.map((s) => ({
              skill: s.skill.trim(),
              skillKey: s.skill.trim().toLocaleLowerCase("en-IN"),
              level: s.level,
            })),
          },
        },
        select: applicationSelection,
      });
    });
  }

  async updateApplicationStatus(companyId, applicationId, userId, status) {
    await this.requireMembership(companyId, userId, ["OWNER", "ADMIN"]);

    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
      },
    });

    if (!application || application.job.companyId !== companyId) {
      throw new NotFoundError("Application not found");
    }

    return this.db.application.update({
      where: { id: applicationId },
      data: { status },
      select: applicationSelection,
    });
  }

  async getCompanyApplications(companyId, userId, jobId = null) {
    await this.requireMembership(companyId, userId, [
      "OWNER",
      "ADMIN",
      "MEMBER",
    ]);

    const whereClause = {
      job: {
        companyId,
      },
    };

    if (jobId) {
      whereClause.jobId = jobId;
    }

    return this.db.application.findMany({
      where: whereClause,
      select: applicationSelection,
      orderBy: { createdAt: "desc" },
    });
  }

  async getCandidateApplications(userId) {
    return this.db.application.findMany({
      where: { userId },
      select: applicationSelection,
      orderBy: { createdAt: "desc" },
    });
  }

  async getApplication(applicationId, userId) {
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      select: applicationSelection,
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    // Check if the user is the applicant
    if (application.userId === userId) {
      return application;
    }

    // Check if the user is a member of the company that posted the job
    const membership = await this.db.companyMembership.findUnique({
      where: {
        userId_companyId: { userId, companyId: application.job.companyId },
      },
    });

    if (!membership) {
      throw new NotFoundError("Application not found"); // Standard security practice to prevent enumeration
    }

    return application;
  }
}
