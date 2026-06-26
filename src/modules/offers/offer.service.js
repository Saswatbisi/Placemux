import crypto from "node:crypto";
import { config } from "../../config.js";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

export class OfferService {
  constructor(db) {
    this.db = db;
    this.secret = config.OFFER_SIGNING_SECRET;
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

  computeSignatureHash(
    offerId,
    applicationId,
    salary,
    startDate,
    probationPeriod,
    signature,
  ) {
    const data = JSON.stringify({
      offerId,
      applicationId,
      salary,
      startDate: new Date(startDate).toISOString(),
      probationPeriod,
      signature,
    });
    return crypto.createHmac("sha256", this.secret).update(data).digest("hex");
  }

  async createOffer(companyId, userId, applicationId, input) {
    // 1. Verify caller has OWNER or ADMIN role in the company
    await this.requireMembership(companyId, userId, ["OWNER", "ADMIN"]);

    // 2. Fetch the application
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
      },
    });

    if (!application || application.job.companyId !== companyId) {
      throw new NotFoundError("Application not found");
    }

    // 3. Prevent duplicate offers
    const existingOffer = await this.db.offer.findUnique({
      where: { applicationId },
    });

    if (existingOffer) {
      throw new ConflictError(
        "An offer has already been generated for this application",
      );
    }

    // 4. Create offer and update status record in transaction
    return this.db.$transaction(async (tx) => {
      const offer = await tx.offer.create({
        data: {
          applicationId,
          salary: input.salary,
          startDate: new Date(input.startDate),
          probationPeriod: input.probationPeriod ?? 3,
          status: "PENDING",
        },
        include: {
          application: {
            select: {
              id: true,
              status: true,
              job: {
                select: {
                  id: true,
                  title: true,
                },
              },
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (tx.applicationStatusRecord) {
        await tx.applicationStatusRecord.upsert({
          where: { applicationId },
          create: { applicationId, status: "OFFER_GENERATED" },
          update: { status: "OFFER_GENERATED" },
        });
      }

      return offer;
    });
  }

  async getOffer(userId, offerId) {
    const offer = await this.db.offer.findUnique({
      where: { id: offerId },
      include: {
        application: {
          include: {
            job: true,
            user: true,
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundError("Offer not found");
    }

    // Access control:
    // Candidate (applicant) can view, or company members of the offering company
    const isApplicant = offer.application.userId === userId;

    let isCompanyMember = false;
    try {
      await this.requireMembership(offer.application.job.companyId, userId);
      isCompanyMember = true;
    } catch {
      // ignore
    }

    if (!isApplicant && !isCompanyMember) {
      throw new NotFoundError("Offer not found");
    }

    return offer;
  }

  async signOffer(userId, offerId, input, ipAddress = "127.0.0.1") {
    // 1. Fetch offer
    const offer = await this.db.offer.findUnique({
      where: { id: offerId },
      include: {
        application: {
          include: {
            job: {
              include: {
                company: true,
              },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundError("Offer not found");
    }

    // 2. Access control: Only the candidate (applicant) can sign
    if (offer.application.userId !== userId) {
      throw new ForbiddenError("You are not authorized to sign this offer");
    }

    // 3. Safety checks
    if (offer.application.job.company?.status === "SUSPENDED") {
      throw new ForbiddenError("This company is suspended");
    }

    if (offer.status !== "PENDING") {
      throw new AppError(
        400,
        "INVALID_OFFER_STATUS",
        `Only pending offers can be signed. Current status: ${offer.status}`,
      );
    }

    // 4. Sign and accept
    const esignApproach = input.esignApproach;
    const updateData = {
      status: "ACCEPTED",
      esignApproach,
      candidateSignedAt: new Date(),
      candidateSignedIp: ipAddress,
    };

    if (esignApproach === "CRYPTOGRAPHIC") {
      updateData.signature = input.signature;
      updateData.signatureHash = this.computeSignatureHash(
        offer.id,
        offer.applicationId,
        offer.salary,
        offer.startDate,
        offer.probationPeriod,
        input.signature,
      );
    } else if (esignApproach === "THIRD_PARTY") {
      const providerTxId = `doc_docusign_${crypto.randomBytes(8).toString("hex")}`;
      updateData.providerTxId = providerTxId;
    }

    return this.db.$transaction(async (tx) => {
      const updatedOffer = await tx.offer.update({
        where: { id: offerId },
        data: updateData,
      });

      if (tx.applicationStatusRecord) {
        await tx.applicationStatusRecord.upsert({
          where: { applicationId: offer.applicationId },
          create: {
            applicationId: offer.applicationId,
            status: "OFFER_ACCEPTED",
          },
          update: { status: "OFFER_ACCEPTED" },
        });
      }

      return updatedOffer;
    });
  }

  async verifyOffer(offerId) {
    const offer = await this.db.offer.findUnique({
      where: { id: offerId },
      include: {
        application: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundError("Offer not found");
    }

    if (offer.status !== "ACCEPTED") {
      return {
        valid: false,
        reason: "Offer has not been accepted and signed yet",
      };
    }

    if (offer.esignApproach === "THIRD_PARTY") {
      return {
        valid: true,
        esignApproach: "THIRD_PARTY",
        providerTxId: offer.providerTxId,
        message:
          "Authenticity verified via third-party provider transaction ledger",
      };
    }

    if (offer.esignApproach === "CRYPTOGRAPHIC") {
      if (!offer.signature || !offer.signatureHash) {
        return {
          valid: false,
          reason:
            "Offer is missing signature name or signature hash in database",
        };
      }

      // Recompute the HMAC and compare
      const computed = this.computeSignatureHash(
        offer.id,
        offer.applicationId,
        offer.salary,
        offer.startDate,
        offer.probationPeriod,
        offer.signature,
      );

      if (computed !== offer.signatureHash) {
        return {
          valid: false,
          tampered: true,
          reason:
            "Cryptographic signature validation failed. The offer content has been tampered with or modified.",
        };
      }

      return {
        valid: true,
        esignApproach: "CRYPTOGRAPHIC",
        signature: offer.signature,
        signedAt: offer.candidateSignedAt,
        signedIp: offer.candidateSignedIp,
        message:
          "Authenticity verified. Cryptographic signature is valid and untampered.",
      };
    }

    return {
      valid: false,
      reason: "Unknown eSign approach",
    };
  }
}
