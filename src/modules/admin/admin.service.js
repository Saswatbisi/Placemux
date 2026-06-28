import { ForbiddenError, NotFoundError } from "../../lib/errors.js";

export class AdminService {
  constructor(db) {
    this.db = db;
  }

  async requirePlatformAdmin(userId) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== "ADMIN") {
      throw new ForbiddenError("Only platform administrators can perform this action");
    }
  }

  // ──────────────────────────────
  //  Item Bank Methods
  // ──────────────────────────────

  async createAssessmentItem(userId, input) {
    await this.requirePlatformAdmin(userId);

    return this.db.assessmentItem.create({
      data: {
        skillKey: input.skillKey,
        difficulty: input.difficulty,
        questionText: input.questionText,
        optionsJson: JSON.stringify(input.options),
        correctAnswer: input.correctAnswer,
        status: "ACTIVE",
      },
    });
  }

  async getAssessmentItems(userId, query) {
    await this.requirePlatformAdmin(userId);

    const { skillKey, difficulty, status } = query;
    const whereClause = { status };

    if (skillKey) {
      whereClause.skillKey = skillKey;
    }
    if (difficulty) {
      whereClause.difficulty = difficulty;
    }

    const items = await this.db.assessmentItem.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    return items.map((item) => ({
      ...item,
      options: JSON.parse(item.optionsJson),
    }));
  }

  async updateAssessmentItem(userId, itemId, input) {
    await this.requirePlatformAdmin(userId);

    const item = await this.db.assessmentItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundError("Assessment item not found");
    }

    const updateData = {};
    if (input.skillKey) updateData.skillKey = input.skillKey;
    if (input.difficulty) updateData.difficulty = input.difficulty;
    if (input.questionText) updateData.questionText = input.questionText;
    if (input.options) updateData.optionsJson = JSON.stringify(input.options);
    if (input.correctAnswer) updateData.correctAnswer = input.correctAnswer;
    if (input.status) updateData.status = input.status;

    const updated = await this.db.assessmentItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return {
      ...updated,
      options: JSON.parse(updated.optionsJson),
    };
  }

  async deleteAssessmentItem(userId, itemId) {
    await this.requirePlatformAdmin(userId);

    const item = await this.db.assessmentItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundError("Assessment item not found");
    }

    // Standard archive deletion
    const archived = await this.db.assessmentItem.update({
      where: { id: itemId },
      data: { status: "ARCHIVED" },
    });

    return {
      ...archived,
      options: JSON.parse(archived.optionsJson),
    };
  }

  // ──────────────────────────────
  //  Proctoring Queue Methods
  // ──────────────────────────────

  async getProctoringQueue(userId) {
    await this.requirePlatformAdmin(userId);

    return this.db.assessmentAttempt.findMany({
      where: { reviewStatus: "PENDING" },
      orderBy: { proctoringFlags: "desc" },
      include: {
        application: {
          select: {
            id: true,
            job: {
              select: { title: true, company: { select: { displayName: true } } },
            },
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });
  }

  async submitIntegrityVerdict(userId, attemptId, input) {
    await this.requirePlatformAdmin(userId);

    const attempt = await this.db.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        application: true,
      },
    });

    if (!attempt) {
      throw new NotFoundError("Assessment attempt not found");
    }

    const { verdict, notes } = input;

    return this.db.$transaction(async (tx) => {
      const updatedAttempt = await tx.assessmentAttempt.update({
        where: { id: attemptId },
        data: {
          verdict,
          notes,
          reviewStatus: "VERIFIED",
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });

      if (verdict === "CONFIRMED_MALPRACTICE") {
        // Automatically reject the candidate's application
        await tx.application.update({
          where: { id: attempt.applicationId },
          data: { status: "REJECTED" },
        });

        if (tx.applicationStatusRecord) {
          await tx.applicationStatusRecord.upsert({
            where: { applicationId: attempt.applicationId },
            create: {
              applicationId: attempt.applicationId,
              status: "REJECTED",
            },
            update: {
              status: "REJECTED",
            },
          });
        }
      }

      return updatedAttempt;
    });
  }
}
