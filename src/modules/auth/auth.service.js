import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AppError, ConflictError } from "../../lib/errors.js";

export class AuthService {
  constructor(db) {
    this.db = db;
  }

  async signupCompany(input) {
    const email = input.owner.email.trim().toLowerCase();
    const phone = input.owner.phone?.replace(/\s+/g, "");
    const registrationNumber = input.company.registrationNumber
      ?.trim()
      .toUpperCase();
    const gstin = input.company.gstin?.trim().toUpperCase();
    const passwordHash = await bcrypt.hash(input.owner.password, 12);

    try {
      return await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: input.owner.name.trim(),
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

        const company = await tx.company.create({
          data: {
            legalName: input.company.legalName.trim(),
            displayName: input.company.displayName.trim(),
            companyType: input.company.companyType,
            registrationNumber,
            gstin,
            memberships: {
              create: {
                userId: user.id,
                role: "OWNER",
              },
            },
            profile: {
              create: {},
            },
            kycVerification: {
              create: {},
            },
          },
          include: {
            profile: true,
            kycVerification: {
              select: {
                id: true,
                status: true,
                submittedAt: true,
              },
            },
            memberships: {
              where: { userId: user.id },
              select: { role: true },
            },
          },
        });

        return { user, company };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(", ")
          : "unique field";
        throw new ConflictError(
          `An account or company already exists with this ${target}`,
          { target: error.meta?.target },
        );
      }
      throw error;
    }
  }

  async login(input) {
    const user = await this.db.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        status: true,
        memberships: {
          select: {
            companyId: true,
            role: true,
          },
        },
      },
    });

    const passwordMatches =
      user && (await bcrypt.compare(input.password, user.passwordHash));

    if (!user || !passwordMatches) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password",
      );
    }
    if (user.status !== "ACTIVE") {
      throw new AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      memberships: user.memberships,
    };
  }
}
