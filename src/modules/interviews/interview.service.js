import {
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

export class InterviewService {
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
      throw new ForbiddenError("You do not have permission to perform this action");
    }
    return membership;
  }

  async scheduleInterview(companyId, userId, applicationId, input) {
    // 1. Verify caller has OWNER, ADMIN, or MEMBER role in the company
    await this.requireMembership(companyId, userId, ["OWNER", "ADMIN", "MEMBER"]);

    // 2. Fetch the application and make sure it belongs to the company
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
      },
    });

    if (!application || application.job.companyId !== companyId) {
      throw new NotFoundError("Application not found");
    }

    // 3. Create interview
    return this.db.interview.create({
      data: {
        applicationId,
        title: input.title,
        scheduledAt: new Date(input.scheduledAt),
        duration: input.duration ?? 30,
        meetingLink: input.meetingLink || null,
        interviewerName: input.interviewerName || null,
        status: "SCHEDULED",
      },
    });
  }

  async getInterview(userId, interviewId) {
    const interview = await this.db.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            job: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundError("Interview not found");
    }

    // Access control:
    // Candidate (applicant) can view, or company members of the offering company
    const isApplicant = interview.application.userId === userId;

    let isCompanyMember = false;
    try {
      await this.requireMembership(interview.application.job.companyId, userId);
      isCompanyMember = true;
    } catch {
      // ignore
    }

    if (!isApplicant && !isCompanyMember) {
      throw new NotFoundError("Interview not found");
    }

    return interview;
  }

  async getInterviewsForApplication(userId, applicationId) {
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
      },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    const isApplicant = application.userId === userId;

    let isCompanyMember = false;
    try {
      await this.requireMembership(application.job.companyId, userId);
      isCompanyMember = true;
    } catch {
      // ignore
    }

    if (!isApplicant && !isCompanyMember) {
      throw new NotFoundError("Application not found");
    }

    return this.db.interview.findMany({
      where: { applicationId },
      orderBy: { scheduledAt: "asc" },
    });
  }

  async updateInterview(userId, interviewId, input) {
    const interview = await this.db.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            job: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundError("Interview not found");
    }

    // Access control: Only company OWNER, ADMIN, or MEMBER can update/reschedule
    await this.requireMembership(interview.application.job.companyId, userId, ["OWNER", "ADMIN", "MEMBER"]);

    const updateData = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.scheduledAt !== undefined) updateData.scheduledAt = new Date(input.scheduledAt);
    if (input.duration !== undefined) updateData.duration = input.duration;
    if (input.meetingLink !== undefined) updateData.meetingLink = input.meetingLink || null;
    if (input.interviewerName !== undefined) updateData.interviewerName = input.interviewerName || null;
    if (input.status !== undefined) updateData.status = input.status;

    return this.db.interview.update({
      where: { id: interviewId },
      data: updateData,
    });
  }
}
