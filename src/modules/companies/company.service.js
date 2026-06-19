import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

const companyDetails = {
  profile: true,
  kycVerification: {
    include: {
      documents: {
        select: {
          id: true,
          type: true,
          fileName: true,
          mimeType: true,
          status: true,
          rejectionReason: true,
          createdAt: true,
        },
      },
    },
  },
  memberships: {
    select: {
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
};

export class CompanyService {
  constructor(db) {
    this.db = db;
  }

  async requireMembership(
    companyId,
    userId,
    allowedRoles,
  ) {
    const membership = await this.db.companyMembership.findUnique({
      where: {
        userId_companyId: { userId, companyId },
      },
      select: { role: true },
    });

    if (!membership) {
      throw new NotFoundError("Company not found");
    }
    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenError();
    }
    return membership;
  }

  async getCompany(companyId, userId) {
    await this.requireMembership(companyId, userId);
    const company = await this.db.company.findUnique({
      where: { id: companyId },
      include: companyDetails,
    });

    if (!company) {
      throw new NotFoundError("Company not found");
    }
    return company;
  }

  async updateProfile(
    companyId,
    userId,
    input,
  ) {
    await this.requireMembership(companyId, userId, ["OWNER", "ADMIN"]);

    return this.db.companyProfile.update({
      where: { companyId },
      data: input,
    });
  }

  async submitKyc(companyId, userId, input) {
    await this.requireMembership(companyId, userId, ["OWNER", "ADMIN"]);

    return this.db.$transaction(async (tx) => {
      const kyc = await tx.kycVerification.findUnique({
        where: { companyId },
        select: { id: true, status: true },
      });

      if (!kyc) {
        throw new NotFoundError("KYC record not found");
      }
      if (kyc.status === "PENDING") {
        throw new ConflictError("KYC is already pending review");
      }
      if (kyc.status === "VERIFIED") {
        throw new ConflictError("KYC has already been verified");
      }

      await tx.kycDocument.deleteMany({
        where: { kycVerificationId: kyc.id },
      });
      await tx.kycDocument.createMany({
        data: input.documents.map((document) => ({
          kycVerificationId: kyc.id,
          ...document,
        })),
      });
      await tx.company.update({
        where: { id: companyId },
        data: { status: "PENDING_KYC" },
      });

      return tx.kycVerification.update({
        where: { id: kyc.id },
        data: {
          status: "PENDING",
          submittedAt: new Date(),
          verifiedAt: null,
          rejectionReason: null,
        },
        include: {
          documents: {
            select: {
              id: true,
              type: true,
              fileName: true,
              mimeType: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });
    });
  }
}
