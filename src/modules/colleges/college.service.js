import bcrypt from "bcryptjs";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

export class CollegeService {
  constructor(db) {
    this.db = db;
  }

  async requireMembership(collegeId, userId, allowedRoles = null) {
    const membership = await this.db.collegeMembership.findUnique({
      where: {
        userId_collegeId: { userId, collegeId },
      },
      select: {
        role: true,
        college: {
          select: { status: true },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenError("You are not a member of this college");
    }

    if (membership.college?.status === "SUSPENDED") {
      throw new ForbiddenError("This college is suspended");
    }

    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenError(
        "You do not have permission to perform this action",
      );
    }

    return membership;
  }

  async signupCollege(input) {
    const email = input.admin.email.trim().toLowerCase();
    const phone = input.admin.phone?.replace(/\s+/g, "");
    const code = input.college.code.trim().toUpperCase();
    const passwordHash = await bcrypt.hash(input.admin.password, 12);

    // Check duplicate email
    const existingUser = await this.db.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictError("An account already exists with this email");
    }

    // Check duplicate college name/code
    const existingCollege = await this.db.college.findFirst({
      where: {
        OR: [{ name: input.college.name.trim() }, { code }],
      },
    });
    if (existingCollege) {
      throw new ConflictError("A college already exists with this name or code");
    }

    return this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.admin.name.trim(),
          email,
          phone,
          passwordHash,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
        },
      });

      const college = await tx.college.create({
        data: {
          name: input.college.name.trim(),
          code,
          memberships: {
            create: {
              userId: user.id,
              role: "ADMIN",
            },
          },
        },
        include: {
          memberships: {
            where: { userId: user.id },
            select: { role: true },
          },
        },
      });

      return { user, college };
    });
  }

  async getCollege(collegeId, userId) {
    await this.requireMembership(collegeId, userId);

    const college = await this.db.college.findUnique({
      where: { id: collegeId },
    });

    if (!college) {
      throw new NotFoundError("College not found");
    }

    return college;
  }

  async addMember(collegeId, callerUserId, input) {
    await this.requireMembership(collegeId, callerUserId, ["ADMIN"]);

    const email = input.email.trim().toLowerCase();
    const user = await this.db.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return this.db.collegeMembership.upsert({
      where: {
        userId_collegeId: {
          userId: user.id,
          collegeId,
        },
      },
      create: {
        userId: user.id,
        collegeId,
        role: input.role,
      },
      update: {
        role: input.role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async getMembers(collegeId, callerUserId) {
    await this.requireMembership(collegeId, callerUserId);

    return this.db.collegeMembership.findMany({
      where: { collegeId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async addStudentByEmail(collegeId, callerUserId, input) {
    await this.requireMembership(collegeId, callerUserId, ["ADMIN", "OFFICER"]);

    const email = input.email.trim().toLowerCase();
    const user = await this.db.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return this.db.user.update({
      where: { id: user.id },
      data: { collegeId },
      select: {
        id: true,
        name: true,
        email: true,
        collegeId: true,
      },
    });
  }

  async getStudents(collegeId, callerUserId) {
    await this.requireMembership(collegeId, callerUserId);

    return this.db.user.findMany({
      where: { collegeId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async joinCollege(userId, input) {
    const { collegeId } = input;
    const college = await this.db.college.findUnique({
      where: { id: collegeId },
    });

    if (!college) {
      throw new NotFoundError("College not found");
    }

    if (college.status === "SUSPENDED") {
      throw new ForbiddenError("This college is suspended");
    }

    return this.db.user.update({
      where: { id: userId },
      data: { collegeId },
      select: {
        id: true,
        name: true,
        email: true,
        collegeId: true,
      },
    });
  }

  async getCollegeDashboard(collegeId, callerUserId) {
    await this.requireMembership(collegeId, callerUserId, ["ADMIN", "OFFICER"]);

    // 1. Get all students of this college
    const students = await this.db.user.findMany({
      where: { collegeId },
      select: { id: true, name: true, email: true },
    });

    const studentIds = students.map((s) => s.id);
    const totalStudents = students.length;

    // 2. Fetch all applications for these students
    const applications = await this.db.application.findMany({
      where: {
        userId: { in: studentIds },
      },
      include: {
        statusRecord: true,
        offer: true,
        job: {
          select: {
            company: {
              select: { displayName: true },
            },
          },
        },
      },
    });

    // Calculate funnel status breakdown
    const funnel = {
      APPLIED: 0,
      SHORTLISTED: 0,
      INTERVIEWING: 0,
      OFFER_GENERATED: 0,
      OFFER_ACCEPTED: 0,
      OFFER_REJECTED: 0,
      OFFER_WITHDRAWN: 0,
      REJECTED: 0,
    };

    const acceptedSalaries = [];
    const companyHiresMap = new Map();
    let totalOffersCount = 0;
    const placedStudentIds = new Set();

    for (const app of applications) {
      let status = "APPLIED";
      if (app.statusRecord?.status) {
        status = app.statusRecord.status;
      } else {
        // Fallback matching
        if (app.status === "SHORTLISTED") status = "SHORTLISTED";
        else if (app.status === "REJECTED") status = "REJECTED";
      }

      if (funnel[status] !== undefined) {
        funnel[status]++;
      }

      // Track offers
      if (app.offer) {
        totalOffersCount++;
        if (app.offer.status === "ACCEPTED") {
          placedStudentIds.add(app.userId);
          acceptedSalaries.push(app.offer.salary);

          const companyName = app.job?.company?.displayName || "Unknown Company";
          companyHiresMap.set(companyName, (companyHiresMap.get(companyName) || 0) + 1);
        }
      }
    }

    const placedCount = placedStudentIds.size;
    const unplacedCount = Math.max(0, totalStudents - placedCount);
    const placementRate = totalStudents > 0 ? (placedCount / totalStudents) * 100 : 0;

    // Salary computations
    let highestSalary = 0;
    let lowestSalary = 0;
    let averageSalary = 0;
    let medianSalary = 0;

    if (acceptedSalaries.length > 0) {
      acceptedSalaries.sort((a, b) => a - b);
      highestSalary = acceptedSalaries[acceptedSalaries.length - 1];
      lowestSalary = acceptedSalaries[0];
      
      const sum = acceptedSalaries.reduce((acc, curr) => acc + curr, 0);
      averageSalary = Math.round(sum / acceptedSalaries.length);

      // Median
      const mid = Math.floor(acceptedSalaries.length / 2);
      if (acceptedSalaries.length % 2 !== 0) {
        medianSalary = acceptedSalaries[mid];
      } else {
        medianSalary = Math.round((acceptedSalaries[mid - 1] + acceptedSalaries[mid]) / 2);
      }
    }

    // Top companies
    const topCompanies = Array.from(companyHiresMap.entries())
      .map(([companyName, hiresCount]) => ({
        companyName,
        hiresCount,
      }))
      .sort((a, b) => b.hiresCount - a.hiresCount || a.companyName.localeCompare(b.companyName));

    return {
      collegeId,
      metrics: {
        totalStudents,
        placedStudents: placedCount,
        unplacedStudents: unplacedCount,
        placementRate: parseFloat(placementRate.toFixed(2)),
        totalApplications: applications.length,
        totalOffers: totalOffersCount,
      },
      salaryStats: {
        averageCTC: averageSalary,
        highestCTC: highestSalary,
        lowestCTC: lowestSalary,
        medianCTC: medianSalary,
      },
      topRecruiters: topCompanies.slice(0, 10),
      applicationFunnel: funnel,
    };
  }
}
