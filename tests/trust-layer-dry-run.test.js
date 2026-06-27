import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";

// Mock Razorpay globally for the dry-run script/test
vi.mock("razorpay", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        orders: {
          create: async (data) => ({
            id: `order_fake_${data.receipt.slice(-6)}`,
            amount: data.amount,
            currency: data.currency,
            status: "created"
          }),
        },
        payments: {
          fetch: async (id) => ({
            id,
            amount: 10000,
            currency: "INR",
            status: "captured"
          }),
          capture: async (id, amount, currency) => ({
            id,
            amount,
            currency,
            status: "captured"
          }),
        },
      };
    }),
  };
});

class InMemoryDb {
  constructor() {
    this.users = [];
    this.companies = [];
    this.companyMemberships = [];
    this.jobs = [];
    this.jobSkillThresholds = [];
    this.applications = [];
    this.candidateSkills = [];
    this.payments = [];
    this.interviews = [];
    this.offers = [];
    this.applicationStatusRecords = [];

    this.$transaction = async (callback) => {
      return callback(this);
    };
  }

  generateId() {
    return Math.floor(Math.random() * 1000000000000).toString(16).padStart(24, '0');
  }

  $disconnect = async () => {};

  user = {
    findUnique: async ({ where }) => {
      if (where.email) {
        return this.users.find(u => u.email === where.email) || null;
      }
      if (where.id) {
        return this.users.find(u => u.id === where.id) || null;
      }
      return null;
    },
    create: async ({ data }) => {
      const u = {
        id: this.generateId(),
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      this.users.push(u);
      return u;
    }
  };

  companyMembership = {
    findUnique: async ({ where }) => {
      const { userId_companyId } = where;
      const m = this.companyMemberships.find(
        m => m.userId === userId_companyId.userId && m.companyId === userId_companyId.companyId
      );
      if (!m) return null;
      const company = this.companies.find(c => c.id === m.companyId);
      return {
        role: m.role,
        company: {
          status: company ? company.status : "ACTIVE"
        }
      };
    }
  };

  company = {
    create: async ({ data }) => {
      const companyId = this.generateId();
      const { memberships, profile, kycVerification, ...rest } = data;
      
      const c = {
        id: companyId,
        status: rest.status || "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...rest
      };
      
      this.companies.push(c);

      if (memberships?.create) {
        const mData = memberships.create;
        const m = {
          id: this.generateId(),
          companyId,
          userId: mData.userId,
          role: mData.role,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.companyMemberships.push(m);
      }

      return {
        ...c,
        profile: { id: this.generateId(), companyId },
        kycVerification: { id: this.generateId(), companyId, status: "VERIFIED" },
        memberships: this.companyMemberships.filter(m => m.companyId === companyId)
      };
    }
  };

  job = {
    findUnique: async ({ where }) => {
      let j;
      if (where.id) {
        j = this.jobs.find(x => x.id === where.id);
      } else if (where.assessmentToken) {
        j = this.jobs.find(x => x.assessmentToken === where.assessmentToken);
      }
      if (!j) return null;
      
      const thresholds = this.jobSkillThresholds.filter(t => t.jobId === j.id);
      const company = this.companies.find(c => c.id === j.companyId);
      
      return {
        ...j,
        skillThresholds: thresholds,
        company
      };
    },
    create: async ({ data }) => {
      const jobId = this.generateId();
      const { skillThresholds, ...rest } = data;
      
      const j = {
        id: jobId,
        status: "PUBLISHED",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...rest
      };
      this.jobs.push(j);

      if (skillThresholds?.create) {
        for (const t of skillThresholds.create) {
          this.jobSkillThresholds.push({
            id: this.generateId(),
            jobId,
            createdAt: new Date(),
            ...t
          });
        }
      }

      return j;
    }
  };

  application = {
    findUnique: async ({ where }) => {
      let app;
      if (where.id) {
        app = this.applications.find(a => a.id === where.id);
      } else if (where.jobId_userId) {
        app = this.applications.find(
          a => a.jobId === where.jobId_userId.jobId && a.userId === where.jobId_userId.userId
        );
      }
      if (!app) return null;

      const job = this.jobs.find(j => j.id === app.jobId);
      const user = this.users.find(u => u.id === app.userId);
      const company = job ? this.companies.find(c => c.id === job.companyId) : null;
      
      return {
        ...app,
        job: job ? { ...job, company } : null,
        user
      };
    },
    create: async ({ data }) => {
      const appId = this.generateId();
      const { candidateSkills, ...rest } = data;

      const app = {
        id: appId,
        status: "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...rest
      };
      this.applications.push(app);

      if (candidateSkills?.create) {
        for (const s of candidateSkills.create) {
          this.candidateSkills.push({
            id: this.generateId(),
            applicationId: appId,
            ...s
          });
        }
      }

      return app;
    },
    update: async ({ where, data }) => {
      const appIndex = this.applications.findIndex(a => a.id === where.id);
      if (appIndex === -1) throw new Error("Application not found");
      this.applications[appIndex] = {
        ...this.applications[appIndex],
        ...data,
        updatedAt: new Date()
      };
      return this.applications[appIndex];
    }
  };

  applicationStatusRecord = {
    findUnique: async ({ where }) => {
      return this.applicationStatusRecords.find(r => r.applicationId === where.applicationId) || null;
    },
    create: async ({ data }) => {
      const r = {
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      this.applicationStatusRecords.push(r);
      return r;
    },
    upsert: async ({ where, create, update }) => {
      const recordIndex = this.applicationStatusRecords.findIndex(r => r.applicationId === where.applicationId);
      if (recordIndex === -1) {
        const r = {
          id: this.generateId(),
          applicationId: where.applicationId,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create
        };
        this.applicationStatusRecords.push(r);
        return r;
      } else {
        this.applicationStatusRecords[recordIndex] = {
          ...this.applicationStatusRecords[recordIndex],
          ...update,
          updatedAt: new Date()
        };
        return this.applicationStatusRecords[recordIndex];
      }
    }
  };

  payment = {
    findUnique: async ({ where }) => {
      const p = this.payments.find(x => x.gatewayOrderId === where.gatewayOrderId);
      if (!p) return null;
      const job = this.jobs.find(j => j.id === p.jobId);
      const company = job ? this.companies.find(c => c.id === job.companyId) : null;
      return {
        ...p,
        job: job ? { ...job, company } : null
      };
    },
    findFirst: async ({ where }) => {
      return this.payments.find(x => x.userId === where.userId && x.jobId === where.jobId && x.status === where.status) || null;
    },
    create: async ({ data }) => {
      const p = {
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      this.payments.push(p);
      return p;
    },
    update: async ({ where, data }) => {
      const idx = this.payments.findIndex(x => x.id === where.id);
      if (idx === -1) throw new Error("Payment not found");
      this.payments[idx] = {
        ...this.payments[idx],
        ...data,
        updatedAt: new Date()
      };
      return this.payments[idx];
    }
  };

  interview = {
    create: async ({ data }) => {
      const i = {
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      this.interviews.push(i);
      return i;
    }
  };

  offer = {
    findUnique: async ({ where }) => {
      let o;
      if (where.id) {
        o = this.offers.find(x => x.id === where.id);
      } else if (where.applicationId) {
        o = this.offers.find(x => x.applicationId === where.applicationId);
      }
      if (!o) return null;

      const application = this.applications.find(a => a.id === o.applicationId);
      const job = application ? this.jobs.find(j => j.id === application.jobId) : null;
      const company = job ? this.companies.find(c => c.id === job.companyId) : null;
      const user = application ? this.users.find(u => u.id === application.userId) : null;

      return {
        ...o,
        application: application ? {
          ...application,
          job: job ? { ...job, company } : null,
          user
        } : null
      };
    },
    create: async ({ data }) => {
      const o = {
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      this.offers.push(o);
      
      const application = this.applications.find(a => a.id === o.applicationId);
      const job = application ? this.jobs.find(j => j.id === application.jobId) : null;
      const user = application ? this.users.find(u => u.id === application.userId) : null;
      
      return {
        ...o,
        application: {
          id: o.applicationId,
          status: application?.status,
          job: {
            id: job?.id,
            title: job?.title
          },
          user: {
            id: user?.id,
            name: user?.name,
            email: user?.email
          }
        }
      };
    },
    update: async ({ where, data }) => {
      const idx = this.offers.findIndex(x => x.id === where.id);
      if (idx === -1) throw new Error("Offer not found");
      this.offers[idx] = {
        ...this.offers[idx],
        ...data,
        updatedAt: new Date()
      };
      return this.offers[idx];
    }
  };
}

describe("Trust Layer E2E Dry-run integration test", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map(a => a.close()));
    apps.length = 0;
  });

  it("successfully runs the entire hiring trust lifecycle end-to-end", async () => {
    const db = new InMemoryDb();
    const app = await buildApp(db);
    apps.push(app);

    // 1. Sign up employer & company
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/companies/signup",
      payload: {
        owner: {
          name: "Acme Owner",
          email: "owner@acme.com",
          password: "SecurePassword123",
          phone: "+919988776655"
        },
        company: {
          legalName: "Acme Recruiting Private Limited",
          displayName: "Acme Recruiting",
          companyType: "PRIVATE_LIMITED",
          registrationNumber: "U72200OD2026PTC050999",
          gstin: "21ABCDE1234F1Z9"
        }
      }
    });
    expect(signupRes.statusCode).toBe(201);
    const companyId = signupRes.json().data.company.id;

    // Login as employer to get JWT
    const ownerLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "owner@acme.com",
        password: "SecurePassword123"
      }
    });
    expect(ownerLoginRes.statusCode).toBe(200);
    const ownerToken = ownerLoginRes.json().data.accessToken;

    // 2. Register candidate & login
    const candidateUser = await db.user.create({
      data: {
        name: "Rohit Kumar",
        email: "rohit@example.com",
        passwordHash: "$2a$12$SecurePasswordHashSimulatedForLogin"
      }
    });
    const candidateToken = app.jwt.sign({ userId: candidateUser.id, email: candidateUser.email });

    // 3. Post Job opening with Skill Thresholds
    const postJobRes = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${companyId}/jobs`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        title: "Senior Node.js Developer",
        description: "Build robust backend architectures with Node.js and Fastify.",
        location: "Bengaluru, Karnataka",
        employmentType: "FULL_TIME",
        workplaceType: "HYBRID",
        skillThresholds: [
          { skill: "Node.js", minimumLevel: 70 },
          { skill: "Fastify", minimumLevel: 50 }
        ]
      }
    });
    expect(postJobRes.statusCode).toBe(201);
    const jobId = postJobRes.json().data.id;

    // 4. Candidate checkout & Payment verify
    const checkoutRes = await app.inject({
      method: "POST",
      url: "/api/v1/payments/checkout",
      headers: { Authorization: `Bearer ${candidateToken}` },
      payload: {
        jobId,
        skills: [
          { skill: "Node.js", level: 80 },
          { skill: "Fastify", level: 60 }
        ]
      }
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkoutData = checkoutRes.json().data;

    const verifyPayRes = await app.inject({
      method: "POST",
      url: "/api/v1/payments/verify",
      headers: { Authorization: `Bearer ${candidateToken}` },
      payload: {
        gatewayOrderId: checkoutData.gatewayOrderId,
        gatewayPaymentId: "pay_fake_tx_999",
        gatewaySignature: crypto
          .createHmac("sha256", config.RAZORPAY_KEY_SECRET)
          .update(`${checkoutData.gatewayOrderId}|pay_fake_tx_999`)
          .digest("hex")
      }
    });
    expect(verifyPayRes.statusCode).toBe(200);
    const applicationId = verifyPayRes.json().data.id;

    // Check application status tracker
    const statusRes1 = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${applicationId}/status`,
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    expect(statusRes1.json().data.status).toBe("APPLIED");

    // 5. Shortlisting
    const shortlistRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/companies/${companyId}/applications/${applicationId}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { status: "SHORTLISTED" }
    });
    expect(shortlistRes.statusCode).toBe(200);

    const statusRes2 = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${applicationId}/status`,
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    expect(statusRes2.json().data.status).toBe("SHORTLISTED");

    // 6. Interview Scheduling
    const scheduleRes = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${companyId}/applications/${applicationId}/interviews`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        title: "Technical Architect Interview",
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        duration: 60,
        meetingLink: "https://meet.google.com/xyz-abc-mno",
        interviewerName: "Siddharth Nair"
      }
    });
    expect(scheduleRes.statusCode).toBe(201);

    const statusRes3 = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${applicationId}/status`,
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    expect(statusRes3.json().data.status).toBe("INTERVIEWING");

    // 7. Offer Generation
    const offerRes = await app.inject({
      method: "POST",
      url: `/api/v1/companies/${companyId}/applications/${applicationId}/offers`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        salary: 1500000,
        startDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        probationPeriod: 3
      }
    });
    expect(offerRes.statusCode).toBe(201);
    const offerId = offerRes.json().data.id;

    const statusRes4 = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${applicationId}/status`,
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    expect(statusRes4.json().data.status).toBe("OFFER_GENERATED");

    // 8. Cryptographic e-Signing by Candidate
    const signRes = await app.inject({
      method: "POST",
      url: `/api/v1/offers/${offerId}/sign`,
      headers: { Authorization: `Bearer ${candidateToken}` },
      payload: {
        esignApproach: "CRYPTOGRAPHIC",
        signature: "Rohit Kumar"
      }
    });
    expect(signRes.statusCode).toBe(200);

    const statusRes5 = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${applicationId}/status`,
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    expect(statusRes5.json().data.status).toBe("OFFER_ACCEPTED");

    // 9. Public Authenticity Verification
    const verifyRes = await app.inject({
      method: "GET",
      url: `/api/v1/offers/${offerId}/verify`
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().data.valid).toBe(true);
    expect(verifyRes.json().data.esignApproach).toBe("CRYPTOGRAPHIC");

    // 10. Database Tampering Proving
    // Directly modify in-memory database salary to simulate tampering
    const offerInDb = db.offers.find(o => o.id === offerId);
    offerInDb.salary = 1800000;

    const verifyResTampered = await app.inject({
      method: "GET",
      url: `/api/v1/offers/${offerId}/verify`
    });
    expect(verifyResTampered.statusCode).toBe(200);
    expect(verifyResTampered.json().data.valid).toBe(false);
    expect(verifyResTampered.json().data.tampered).toBe(true);
    expect(verifyResTampered.json().data.reason).toContain("tampered");
  });
});
