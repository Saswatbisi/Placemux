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

  async updateStudentSkills(collegeId, callerUserId, studentId, input) {
    await this.requireMembership(collegeId, callerUserId, ["ADMIN", "OFFICER"]);

    const student = await this.db.user.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundError("Student not found");
    }

    if (student.collegeId !== collegeId) {
      throw new ForbiddenError("This student does not belong to your college");
    }

    // Format skills
    const formattedSkills = input.skills.map((s) => ({
      skill: s.skill.trim(),
      skillKey: s.skill.trim().toLocaleLowerCase("en-IN"),
      level: s.level,
    }));

    const updated = await this.db.user.update({
      where: { id: studentId },
      data: {
        skillsJson: JSON.stringify(formattedSkills),
      },
      select: {
        id: true,
        name: true,
        email: true,
        skillsJson: true,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      skills: updated.skillsJson ? JSON.parse(updated.skillsJson) : [],
    };
  }

  async getStudentPlacementReport(collegeId, callerUserId) {
    await this.requireMembership(collegeId, callerUserId, ["ADMIN", "OFFICER"]);

    const students = await this.db.user.findMany({
      where: { collegeId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        applications: {
          include: {
            statusRecord: true,
            offer: {
              include: {
                application: {
                  include: {
                    job: {
                      include: {
                        company: {
                          select: { displayName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return students.map((student) => {
      const apps = student.applications || [];
      const offers = apps.filter((a) => a.offer);
      const acceptedOffer = offers.find((o) => o.offer.status === "ACCEPTED");

      return {
        studentId: student.id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        placementStatus: acceptedOffer ? "PLACED" : "UNPLACED",
        applicationsCount: apps.length,
        offersCount: offers.length,
        acceptedOffer: acceptedOffer
          ? {
              offerId: acceptedOffer.offer.id,
              companyName: acceptedOffer.offer.application.job.company.displayName,
              salary: acceptedOffer.offer.salary,
              startDate: acceptedOffer.offer.startDate,
              esignApproach: acceptedOffer.offer.esignApproach,
            }
          : null,
      };
    });
  }

  async getCompanyPlacementReport(collegeId, callerUserId) {
    await this.requireMembership(collegeId, callerUserId, ["ADMIN", "OFFICER"]);

    // Find all student IDs of this college
    const students = await this.db.user.findMany({
      where: { collegeId },
      select: { id: true },
    });
    const studentIds = students.map((s) => s.id);

    // Get all applications for these students
    const applications = await this.db.application.findMany({
      where: { userId: { in: studentIds } },
      include: {
        offer: true,
        job: {
          include: {
            company: {
              select: { displayName: true },
            },
          },
        },
      },
    });

    // Aggregate stats by company name
    const companyStats = new Map();

    for (const app of applications) {
      const companyName = app.job?.company?.displayName || "Unknown Company";
      if (!companyStats.has(companyName)) {
        companyStats.set(companyName, {
          companyName,
          appliedCount: 0,
          offersCount: 0,
          acceptedCount: 0,
          totalSalary: 0,
        });
      }

      const stats = companyStats.get(companyName);
      stats.appliedCount++;

      if (app.offer) {
        stats.offersCount++;
        if (app.offer.status === "ACCEPTED") {
          stats.acceptedCount++;
          stats.totalSalary += app.offer.salary;
        }
      }
    }

    return Array.from(companyStats.values())
      .map((stats) => ({
        companyName: stats.companyName,
        appliedCount: stats.appliedCount,
        offersCount: stats.offersCount,
        acceptedCount: stats.acceptedCount,
        averageCTC: stats.acceptedCount > 0 ? Math.round(stats.totalSalary / stats.acceptedCount) : 0,
      }))
      .sort((a, b) => b.acceptedCount - a.acceptedCount || a.companyName.localeCompare(b.companyName));
  }

  // Helper to extract student's consolidated skills
  #getStudentConsolidatedSkills(student) {
    if (student.skillsJson) {
      try {
        return JSON.parse(student.skillsJson);
      } catch {
        // Fall through
      }
    }

    // Fall back to max skills from applications
    const skillMap = new Map();
    const apps = student.applications || [];
    for (const app of apps) {
      const candidateSkills = app.candidateSkills || [];
      for (const cs of candidateSkills) {
        const key = cs.skill.trim().toLocaleLowerCase("en-IN");
        const existingLevel = skillMap.get(key)?.level || 0;
        if (cs.level > existingLevel) {
          skillMap.set(key, { skill: cs.skill.trim(), skillKey: key, level: cs.level });
        }
      }
    }
    return Array.from(skillMap.values());
  }

  async getJobRecommendationsForStudent(collegeId, callerUserId, studentId) {
    await this.requireMembership(collegeId, callerUserId, ["ADMIN", "OFFICER"]);

    const student = await this.db.user.findUnique({
      where: { id: studentId },
      include: {
        applications: {
          include: {
            candidateSkills: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundError("Student not found");
    }

    if (student.collegeId !== collegeId) {
      throw new ForbiddenError("This student does not belong to your college");
    }

    const studentSkills = this.#getStudentConsolidatedSkills(student);
    if (studentSkills.length === 0) {
      return {
        student: { id: student.id, name: student.name, email: student.email, skills: [] },
        recommendations: [],
      };
    }

    // Fetch all active/published jobs
    const jobs = await this.db.job.findMany({
      where: {
        status: "PUBLISHED",
        company: { status: { not: "SUSPENDED" } },
      },
      include: {
        company: { select: { displayName: true } },
        skillThresholds: true,
      },
    });

    const studentSkillMap = new Map(studentSkills.map((s) => [s.skillKey, s.level]));
    const recommendations = [];

    for (const job of jobs) {
      const thresholds = job.skillThresholds || [];
      if (thresholds.length === 0) {
        // Job has no skill thresholds, it matches automatically (100%)
        recommendations.push({
          job: {
            id: job.id,
            title: job.title,
            companyName: job.company.displayName,
            location: job.location,
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
          },
          matchPercentage: 100,
          thresholds: [],
          studentSkills: [],
          matchScore: 0,
        });
        continue;
      }

      let isEligible = true;
      let totalThresholds = thresholds.length;
      let matchedCount = 0;
      let totalExcess = 0;
      const jobThresholdsList = [];
      const studentSkillsList = [];

      for (const th of thresholds) {
        const studentLevel = studentSkillMap.get(th.skillKey);
        jobThresholdsList.push({ skill: th.skill, minimumLevel: th.minimumLevel });
        studentSkillsList.push({ skill: th.skill, level: studentLevel || 0 });

        if (studentLevel !== undefined && studentLevel >= th.minimumLevel) {
          matchedCount++;
          totalExcess += studentLevel - th.minimumLevel;
        } else {
          isEligible = false;
        }
      }

      // Recommend only if candidate is eligible (meets all thresholds)
      if (isEligible) {
        const matchPercentage = Math.round((matchedCount / totalThresholds) * 100);
        const avgExcess = totalThresholds > 0 ? totalExcess / totalThresholds : 0;

        recommendations.push({
          job: {
            id: job.id,
            title: job.title,
            companyName: job.company.displayName,
            location: job.location,
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
          },
          matchPercentage,
          thresholds: jobThresholdsList,
          studentSkills: studentSkillsList,
          matchScore: avgExcess,
        });
      }
    }

    // Sort by match score (highest excess first), then title
    recommendations.sort((a, b) => b.matchScore - a.matchScore || a.job.title.localeCompare(b.job.title));

    // Clean up internal matchScore from user response
    const cleanedRecommendations = recommendations.map(({ matchScore, ...rest }) => rest);

    return {
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        skills: studentSkills.map((s) => ({ skill: s.skill, level: s.level })),
      },
      recommendations: cleanedRecommendations,
    };
  }

  async getStudentRecommendationsForJob(collegeId, callerUserId, jobId) {
    await this.requireMembership(collegeId, callerUserId, ["ADMIN", "OFFICER"]);

    const job = await this.db.job.findUnique({
      where: { id: jobId },
      include: {
        company: { select: { displayName: true, status: true } },
        skillThresholds: true,
      },
    });

    if (!job || job.status !== "PUBLISHED" || job.company?.status === "SUSPENDED") {
      throw new NotFoundError("Job not found");
    }

    const thresholds = job.skillThresholds || [];

    // Fetch all students of this college
    const students = await this.db.user.findMany({
      where: { collegeId },
      include: {
        applications: {
          include: {
            candidateSkills: true,
          },
        },
      },
    });

    const recommendations = [];

    for (const student of students) {
      const studentSkills = this.#getStudentConsolidatedSkills(student);
      const studentSkillMap = new Map(studentSkills.map((s) => [s.skillKey, s.level]));

      if (thresholds.length === 0) {
        recommendations.push({
          student: {
            id: student.id,
            name: student.name,
            email: student.email,
            skills: studentSkills.map((s) => ({ skill: s.skill, level: s.level })),
          },
          matchScore: 0,
        });
        continue;
      }

      let isEligible = true;
      let totalExcess = 0;

      for (const th of thresholds) {
        const studentLevel = studentSkillMap.get(th.skillKey);
        if (studentLevel !== undefined && studentLevel >= th.minimumLevel) {
          totalExcess += studentLevel - th.minimumLevel;
        } else {
          isEligible = false;
          break;
        }
      }

      if (isEligible) {
        const avgExcess = totalExcess / thresholds.length;
        recommendations.push({
          student: {
            id: student.id,
            name: student.name,
            email: student.email,
            skills: studentSkills.map((s) => ({ skill: s.skill, level: s.level })),
          },
          matchScore: parseFloat(avgExcess.toFixed(2)),
        });
      }
    }

    // Sort by matchScore desc, then student name asc
    recommendations.sort((a, b) => b.matchScore - a.matchScore || a.student.name.localeCompare(b.student.name));

    return {
      job: {
        id: job.id,
        title: job.title,
        companyName: job.company.displayName,
        thresholds: thresholds.map((t) => ({ skill: t.skill, minimumLevel: t.minimumLevel })),
      },
      recommendations,
    };
  }
}

