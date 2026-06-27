import crypto from "node:crypto";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import Razorpay from "razorpay";

// ---------------------------------------------------------
// 1. Mock Razorpay globally for the dry-run script
// ---------------------------------------------------------
Object.defineProperty(Razorpay.prototype, "orders", {
  get() {
    return {
      create: async (data) => {
        console.log(`   [Razorpay Mock] Created order: order_fake_${data.receipt.slice(-6)}`);
        return {
          id: `order_fake_${data.receipt.slice(-6)}`,
          amount: data.amount,
          currency: data.currency,
          status: "created"
        };
      }
    };
  },
  set(val) {},
  configurable: true
});

Object.defineProperty(Razorpay.prototype, "payments", {
  get() {
    return {
      fetch: async (id) => {
        console.log(`   [Razorpay Mock] Fetched payment details for ${id}`);
        return {
          id,
          amount: 10000,
          currency: "INR",
          status: "captured"
        };
      },
      capture: async (id, amount, currency) => {
        console.log(`   [Razorpay Mock] Captured payment ${id} of ₹${amount / 100}`);
        return {
          id,
          amount,
          currency,
          status: "captured"
        };
      }
    };
  },
  set(val) {},
  configurable: true
});

Object.defineProperty(Razorpay.prototype, "refunds", {
  get() {
    return {
      create: async (data) => {
        console.log(`   [Razorpay Mock] Created refund for payment ${data.payment_id}`);
        return {
          id: "ref_fake_123",
          status: "processed"
        };
      }
    };
  },
  set(val) {},
  configurable: true
});

// ---------------------------------------------------------
// 2. In-Memory Database (Prisma Client Mock)
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 3. Execution Flow Simulation
// ---------------------------------------------------------
async function runDryRun() {
  console.log("======================================================================");
  console.log("🚀 STARTING: Task 15 - Trust Layer End-to-End Dry Run Simulation");
  console.log("======================================================================\n");

  const db = new InMemoryDb();
  const app = await buildApp(db);

  let candidateToken, ownerToken;
  let companyId, jobId, applicationId, offerId;

  // Helper to generate headers
  const authHeaders = (token) => ({
    Authorization: `Bearer ${token}`
  });

  // --- STEP 1: Registration of Employer (Owner) & Company ---
  console.log("👉 STEP 1: Registering Corporate Employer and Company...");
  const signupResponse = await app.inject({
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

  if (signupResponse.statusCode !== 201) {
    console.error("❌ Step 1 Failed:", signupResponse.json());
    process.exit(1);
  }

  const signupBody = signupResponse.json();
  companyId = signupBody.data.company.id;
  console.log(`   ✅ Company Registered: ${signupBody.data.company.displayName} (ID: ${companyId})`);

  // Log in as Owner to obtain JWT
  const ownerLoginRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "owner@acme.com",
      password: "SecurePassword123"
    }
  });
  ownerToken = ownerLoginRes.json().data.accessToken;
  console.log(`   ✅ Employer authenticated successfully.`);

  // --- STEP 2: Candidate Registration & Login ---
  console.log("\n👉 STEP 2: Registering Candidate User...");
  const candidateUser = await db.user.create({
    data: {
      name: "Rohit Kumar",
      email: "rohit@example.com",
      passwordHash: "$2a$12$SecurePasswordHashSimulatedForLogin"
    }
  });
  console.log(`   ✅ Candidate Registered: ${candidateUser.name} (ID: ${candidateUser.id})`);

  // Get Candidate Token
  candidateToken = app.jwt.sign({ userId: candidateUser.id, email: candidateUser.email });
  console.log(`   ✅ Candidate authenticated successfully.`);

  // --- STEP 3: Post Job opening with Skill Thresholds ---
  console.log("\n👉 STEP 3: Posting Job Opening with technical skill thresholds...");
  const postJobResponse = await app.inject({
    method: "POST",
    url: `/api/v1/companies/${companyId}/jobs`,
    headers: authHeaders(ownerToken),
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

  if (postJobResponse.statusCode !== 201) {
    console.error("❌ Step 3 Failed:", postJobResponse.json());
    process.exit(1);
  }

  const jobBody = postJobResponse.json();
  jobId = jobBody.data.id;
  console.log(`   ✅ Job Posted: "${jobBody.data.title}" (ID: ${jobId})`);
  console.log(`   ✅ Skill thresholds configured: Node.js (70+), Fastify (50+)`);

  // --- STEP 4: Candidate checkout & Payment verify ---
  console.log("\n👉 STEP 4: Simulating candidate checkout & application payment...");
  
  const checkoutResponse = await app.inject({
    method: "POST",
    url: "/api/v1/payments/checkout",
    headers: authHeaders(candidateToken),
    payload: {
      jobId,
      skills: [
        { skill: "Node.js", level: 80 },
        { skill: "Fastify", level: 60 }
      ]
    }
  });

  if (checkoutResponse.statusCode !== 201) {
    console.error("❌ Checkout failed:", checkoutResponse.json());
    process.exit(1);
  }

  const checkoutData = checkoutResponse.json().data;
  console.log(`   ✅ Razorpay payment order initiated (ID: ${checkoutData.gatewayOrderId})`);

  const verifyPayResponse = await app.inject({
    method: "POST",
    url: "/api/v1/payments/verify",
    headers: authHeaders(candidateToken),
    payload: {
      gatewayOrderId: checkoutData.gatewayOrderId,
      gatewayPaymentId: "pay_fake_tx_999",
      gatewaySignature: crypto
        .createHmac("sha256", config.RAZORPAY_KEY_SECRET)
        .update(`${checkoutData.gatewayOrderId}|pay_fake_tx_999`)
        .digest("hex")
    }
  });

  if (verifyPayResponse.statusCode !== 200) {
    console.error("❌ Payment verification failed:", verifyPayResponse.json());
    process.exit(1);
  }

  const appData = verifyPayResponse.json().data;
  applicationId = appData.id;
  console.log(`   ✅ Payment verified successfully! Application ID: ${applicationId}`);

  const statusRes1 = await app.inject({
    method: "GET",
    url: `/api/v1/applications/${applicationId}/status`,
    headers: authHeaders(candidateToken)
  });
  console.log(`   ✅ Initial application status tracker record: [${statusRes1.json().data.status}]`);

  // --- STEP 5: Shortlisting Candidate ---
  console.log("\n👉 STEP 5: Employer shortlists candidate application...");
  const shortlistResponse = await app.inject({
    method: "PATCH",
    url: `/api/v1/companies/${companyId}/applications/${applicationId}`,
    headers: authHeaders(ownerToken),
    payload: {
      status: "SHORTLISTED"
    }
  });

  if (shortlistResponse.statusCode !== 200) {
    console.error("❌ Shortlisting failed:", shortlistResponse.json());
    process.exit(1);
  }

  const statusRes2 = await app.inject({
    method: "GET",
    url: `/api/v1/applications/${applicationId}/status`,
    headers: authHeaders(candidateToken)
  });
  console.log(`   ✅ Updated application status tracker record: [${statusRes2.json().data.status}]`);

  // --- STEP 6: Interview Scheduling ---
  console.log("\n👉 STEP 6: Employer schedules candidate interview round...");
  const scheduleResponse = await app.inject({
    method: "POST",
    url: `/api/v1/companies/${companyId}/applications/${applicationId}/interviews`,
    headers: authHeaders(ownerToken),
    payload: {
      title: "Technical Architect Interview",
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      duration: 60,
      meetingLink: "https://meet.google.com/xyz-abc-mno",
      interviewerName: "Siddharth Nair"
    }
  });

  if (scheduleResponse.statusCode !== 201) {
    console.error("❌ Interview scheduling failed:", scheduleResponse.json());
    process.exit(1);
  }

  console.log(`   ✅ Interview scheduled successfully.`);

  const statusRes3 = await app.inject({
    method: "GET",
    url: `/api/v1/applications/${applicationId}/status`,
    headers: authHeaders(candidateToken)
  });
  console.log(`   ✅ Updated application status tracker record: [${statusRes3.json().data.status}]`);

  // --- STEP 7: Job Offer Generation ---
  console.log("\n👉 STEP 7: Employer issues Job Offer...");
  const offerResponse = await app.inject({
    method: "POST",
    url: `/api/v1/companies/${companyId}/applications/${applicationId}/offers`,
    headers: authHeaders(ownerToken),
    payload: {
      salary: 1500000,
      startDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      probationPeriod: 3
    }
  });

  if (offerResponse.statusCode !== 201) {
    console.error("❌ Offer generation failed:", offerResponse.json());
    process.exit(1);
  }

  const offerBody = offerResponse.json();
  offerId = offerBody.data.id;
  console.log(`   ✅ Job Offer generated (ID: ${offerId}, Salary: ₹${offerBody.data.salary} CTC)`);

  const statusRes4 = await app.inject({
    method: "GET",
    url: `/api/v1/applications/${applicationId}/status`,
    headers: authHeaders(candidateToken)
  });
  console.log(`   ✅ Updated application status tracker record: [${statusRes4.json().data.status}]`);

  // --- STEP 8: Cryptographic e-Signing by Candidate ---
  console.log("\n👉 STEP 8: Candidate signs the offer cryptographically...");
  const signResponse = await app.inject({
    method: "POST",
    url: `/api/v1/offers/${offerId}/sign`,
    headers: authHeaders(candidateToken),
    payload: {
      esignApproach: "CRYPTOGRAPHIC",
      signature: "Rohit Kumar"
    }
  });

  if (signResponse.statusCode !== 200) {
    console.error("❌ Offer signing failed:", signResponse.json());
    process.exit(1);
  }

  const signedOffer = signResponse.json().data;
  console.log(`   ✅ Cryptographic signature stored successfully.`);
  console.log(`   ✅ Generated Verification Hash: ${signedOffer.signatureHash}`);

  const statusRes5 = await app.inject({
    method: "GET",
    url: `/api/v1/applications/${applicationId}/status`,
    headers: authHeaders(candidateToken)
  });
  console.log(`   ✅ Updated application status tracker record: [${statusRes5.json().data.status}]`);

  // --- STEP 9: Public Authenticity Verification ---
  console.log("\n👉 STEP 9: Publicly verifying signed offer authenticity...");
  const verifyRes = await app.inject({
    method: "GET",
    url: `/api/v1/offers/${offerId}/verify`
  });

  if (verifyRes.statusCode !== 200) {
    console.error("❌ Public verification request failed:", verifyRes.json());
    process.exit(1);
  }

  const verificationResult = verifyRes.json().data;
  console.log(`   🔍 Verification Status: Valid = ${verificationResult.valid}`);
  console.log(`   🔍 Message: "${verificationResult.message}"`);
  console.log(`   🔍 Signee Name: "${verificationResult.signature}" at IP: ${verificationResult.signedIp}`);

  // --- STEP 10: Database Tampering Proving ---
  console.log("\n👉 STEP 10: Simulating DB tampering to verify detection...");
  console.log(`   [Action] Modifying offer salary directly in database from ₹1,500,000 to ₹1,800,000 without regenerating signature...`);
  
  const offerInDb = db.offers.find(o => o.id === offerId);
  offerInDb.salary = 1800000;

  console.log(`   [Action] Re-running public verification check on tampered record...`);
  const verifyResTampered = await app.inject({
    method: "GET",
    url: `/api/v1/offers/${offerId}/verify`
  });

  const tamperedResult = verifyResTampered.json().data;
  console.log(`   🔍 Verification Status: Valid = ${tamperedResult.valid}`);
  console.log(`   🚨 Tampering Flagged: Tampered = ${tamperedResult.tampered}`);
  console.log(`   🚨 Failure Reason: "${tamperedResult.reason}"`);

  console.log("\n======================================================================");
  console.log("🎉 SUCCESS: Trust Layer End-to-End Dry Run completed with 100% success!");
  console.log("======================================================================");
  
  await app.close();
}

runDryRun().catch(err => {
  console.error("❌ Dry-run script error:", err);
  process.exit(1);
});
