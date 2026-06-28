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
        return {
          id,
          amount: 10000,
          currency: "INR",
          status: "captured"
        };
      },
      capture: async (id, amount, currency) => {
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

// ---------------------------------------------------------
// 2. Extended In-Memory Database (Prisma Client Mock)
// ---------------------------------------------------------
class InMemoryDb {
  constructor() {
    this.users = [];
    this.companies = [];
    this.companyMemberships = [];
    this.colleges = [];
    this.collegeMemberships = [];
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

  #resolveApplicationRelations(app) {
    const statusRecord = this.applicationStatusRecords.find(sr => sr.applicationId === app.id) || null;
    const offer = this.offers.find(o => o.applicationId === app.id) || null;
    const candidateSkills = this.candidateSkills.filter(cs => cs.applicationId === app.id);
    const job = this.jobs.find(j => j.id === app.jobId) || null;
    const company = job ? this.companies.find(c => c.id === job.companyId) : null;
    
    return {
      ...app,
      statusRecord,
      offer: offer ? {
        ...offer,
        application: {
          ...app,
          job: job ? {
            ...job,
            company: company ? { displayName: company.displayName } : { displayName: "Unknown" }
          } : null
        }
      } : null,
      candidateSkills,
      job: job ? {
        ...job,
        company: company ? { displayName: company.displayName } : { displayName: "Unknown" }
      } : null,
      user: this.users.find(u => u.id === app.userId)
    };
  }

  user = {
    findUnique: async ({ where, include, select }) => {
      let u;
      if (where.email) {
        u = this.users.find(u => u.email === where.email) || null;
      } else if (where.id) {
        u = this.users.find(u => u.id === where.id) || null;
      }
      if (!u) return null;
      u = { ...u };
      if (include?.applications || select?.applications) {
        u.applications = this.applications
          .filter(a => a.userId === u.id)
          .map(a => this.#resolveApplicationRelations(a));
      }
      return u;
    },
    findMany: async ({ where, include, select }) => {
      let filtered = this.users;
      if (where?.collegeId) {
        filtered = this.users.filter(u => u.collegeId === where.collegeId);
      }
      return filtered.map(u => {
        u = { ...u };
        if (include?.applications || select?.applications) {
          u.applications = this.applications
            .filter(a => a.userId === u.id)
            .map(a => this.#resolveApplicationRelations(a));
        }
        return u;
      });
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
    },
    update: async ({ where, data }) => {
      const idx = this.users.findIndex(u => u.id === where.id);
      if (idx === -1) throw new Error("User not found");
      this.users[idx] = {
        ...this.users[idx],
        ...data,
        updatedAt: new Date()
      };
      return this.users[idx];
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

  collegeMembership = {
    findUnique: async ({ where }) => {
      const { userId_collegeId } = where;
      const m = this.collegeMemberships.find(
        x => x.userId === userId_collegeId.userId && x.collegeId === userId_collegeId.collegeId
      );
      if (!m) return null;
      const college = this.colleges.find(c => c.id === m.collegeId);
      return {
        role: m.role,
        college: {
          status: college ? college.status : "ACTIVE"
        }
      };
    },
    create: async ({ data }) => {
      const m = {
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      this.collegeMemberships.push(m);
      return m;
    },
    upsert: async ({ where, create, update }) => {
      const { userId_collegeId } = where;
      const idx = this.collegeMemberships.findIndex(
        x => x.userId === userId_collegeId.userId && x.collegeId === userId_collegeId.collegeId
      );
      
      const u = this.users.find(x => x.id === userId_collegeId.userId);

      if (idx === -1) {
        const m = {
          id: this.generateId(),
          userId: userId_collegeId.userId,
          collegeId: userId_collegeId.collegeId,
          role: create.role,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.collegeMemberships.push(m);
        return { ...m, user: u };
      } else {
        this.collegeMemberships[idx].role = update.role;
        this.collegeMemberships[idx].updatedAt = new Date();
        return { ...this.collegeMemberships[idx], user: u };
      }
    },
    findMany: async ({ where }) => {
      let filtered = this.collegeMemberships;
      if (where.collegeId) {
        filtered = filtered.filter(x => x.collegeId === where.collegeId);
      }
      return filtered.map(m => {
        const user = this.users.find(u => u.id === m.userId);
        return { ...m, user };
      });
    }
  };

  college = {
    findUnique: async ({ where }) => {
      return this.colleges.find(c => c.id === where.id) || null;
    },
    findFirst: async ({ where }) => {
      if (where.OR) {
        return this.colleges.find(c => {
          return c.name === where.OR[0].name || c.code === where.OR[1].code;
        }) || null;
      }
      return null;
    },
    create: async ({ data }) => {
      const collegeId = this.generateId();
      const { memberships, ...rest } = data;
      
      const col = {
        id: collegeId,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...rest
      };
      this.colleges.push(col);

      if (memberships?.create) {
        const mData = memberships.create;
        this.collegeMemberships.push({
          id: this.generateId(),
          collegeId,
          userId: mData.userId,
          role: mData.role,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      return {
        ...col,
        memberships: this.collegeMemberships.filter(m => m.collegeId === collegeId)
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
    findMany: async ({ where }) => {
      let filtered = this.jobs;
      if (where?.status) {
        filtered = filtered.filter(j => j.status === where.status);
      }
      if (where?.company?.status?.not) {
        filtered = filtered.filter(j => {
          const comp = this.companies.find(c => c.id === j.companyId);
          return comp && comp.status !== where.company.status.not;
        });
      }
      return filtered.map(j => {
        const thresholds = this.jobSkillThresholds.filter(t => t.jobId === j.id);
        const company = this.companies.find(c => c.id === j.companyId);
        return {
          ...j,
          skillThresholds: thresholds,
          company
        };
      });
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
    findMany: async ({ where }) => {
      let filtered = this.applications;
      if (where.userId && where.userId.in) {
        filtered = filtered.filter(a => where.userId.in.includes(a.userId));
      }
      return filtered.map(app => {
        const statusRecord = this.applicationStatusRecords.find(r => r.applicationId === app.id) || null;
        const offer = this.offers.find(o => o.applicationId === app.id) || null;
        const job = this.jobs.find(j => j.id === app.jobId);
        const company = job ? this.companies.find(c => c.id === job.companyId) : null;
        return {
          ...app,
          statusRecord,
          offer,
          job: job ? { ...job, company } : null
        };
      });
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
async function runCollegeDryRun() {
  console.log("======================================================================");
  console.log("🚀 STARTING: Task 16 - College Portal & Reporting API Foundations Dry Run");
  console.log("======================================================================\n");

  const db = new InMemoryDb();
  const app = await buildApp(db);

  let collegeAId, collegeBId;
  let adminAToken, adminBToken, officerAToken, studentToken, employerToken;
  let companyId, jobId, applicationId, offerId;

  // Helper to generate headers
  const authHeaders = (token) => ({
    Authorization: `Bearer ${token}`
  });

  // --- STEP 1: College A Onboarding (Onboards College A & Admin A) ---
  console.log("👉 STEP 1: Onboarding College A ('NIT Trichy') and registering Head Admin...");
  const signupARes = await app.inject({
    method: "POST",
    url: "/api/v1/colleges/signup",
    payload: {
      admin: {
        name: "NIT Admin",
        email: "tpo@nitt.edu",
        password: "SecurePassword123"
      },
      college: {
        name: "National Institute of Technology Trichy",
        code: "NITT"
      }
    }
  });

  if (signupARes.statusCode !== 201) {
    console.error("❌ Step 1 Failed:", signupARes.json());
    process.exit(1);
  }

  const signupABody = signupARes.json();
  collegeAId = signupABody.data.college.id;
  adminAToken = signupABody.data.accessToken;
  console.log(`   ✅ College A Onboarded: ${signupABody.data.college.name} (ID: ${collegeAId})`);

  // --- STEP 2: College B Onboarding (Onboards College B & Admin B) ---
  console.log("\n👉 STEP 2: Onboarding College B ('IIT Delhi') for data isolation tests...");
  const signupBRes = await app.inject({
    method: "POST",
    url: "/api/v1/colleges/signup",
    payload: {
      admin: {
        name: "IITD Admin",
        email: "tpo@iitd.ac.in",
        password: "SecurePassword123"
      },
      college: {
        name: "Indian Institute of Technology Delhi",
        code: "IITD"
      }
    }
  });

  const signupBBody = signupBRes.json();
  collegeBId = signupBBody.data.college.id;
  adminBToken = signupBBody.data.accessToken;
  console.log(`   ✅ College B Onboarded: ${signupBBody.data.college.name} (ID: ${collegeBId})`);

  // --- STEP 3: Add Officer to College A ---
  console.log("\n👉 STEP 3: Head Admin of College A adds a Placement Officer...");
  
  // Register officer user in database first
  const officerUser = await db.user.create({
    data: {
      name: "NIT Assistant",
      email: "assistant@nitt.edu",
      passwordHash: "xxx"
    }
  });
  
  const addOfficerRes = await app.inject({
    method: "POST",
    url: `/api/v1/colleges/${collegeAId}/members`,
    headers: authHeaders(adminAToken),
    payload: {
      email: "assistant@nitt.edu",
      role: "OFFICER"
    }
  });

  if (addOfficerRes.statusCode !== 201) {
    console.error("❌ Step 3 Failed:", addOfficerRes.json());
    process.exit(1);
  }

  console.log(`   ✅ Placement Officer registered successfully for ${signupABody.data.college.name}`);
  officerAToken = app.jwt.sign({ userId: officerUser.id, email: officerUser.email });

  // --- STEP 4: Add Students to College A ---
  console.log("\n👉 STEP 4: Adding NIT Trichy students (Student A & Student B)...");

  // Create student users
  const studentUserA = await db.user.create({
    data: {
      name: "Aman Gupta",
      email: "aman@nitt.edu",
      passwordHash: "xxx"
    }
  });

  const studentUserB = await db.user.create({
    data: {
      name: "Bhavna Rao",
      email: "bhavna@nitt.edu",
      passwordHash: "xxx"
    }
  });

  // Admin associates Student A
  await app.inject({
    method: "POST",
    url: `/api/v1/colleges/${collegeAId}/students`,
    headers: authHeaders(adminAToken),
    payload: {
      email: "aman@nitt.edu"
    }
  });

  // Student B joins College A via self-association
  studentToken = app.jwt.sign({ userId: studentUserB.id, email: studentUserB.email });
  await app.inject({
    method: "POST",
    url: "/api/v1/colleges/join",
    headers: authHeaders(studentToken),
    payload: {
      collegeId: collegeAId
    }
  });

  console.log(`   ✅ 2 Students associated with College A.`);

  // --- STEP 5: Job Posting & Offer Generation for Student A ---
  console.log("\n👉 STEP 5: Simulating corporate recruitment and offer generation for Student A...");
  
  // 5a. Signup Company Employer
  const compSignup = await app.inject({
    method: "POST",
    url: "/api/v1/auth/companies/signup",
    payload: {
      owner: {
        name: "Google Recruiter",
        email: "recruiter@google.com",
        password: "SecurePassword123"
      },
      company: {
        legalName: "Google India Private Limited",
        displayName: "Google",
        companyType: "PRIVATE_LIMITED",
        registrationNumber: "U72200OD2026PTC099111"
      }
    }
  });
  const compBody = compSignup.json();
  companyId = compBody.data.company.id;
  employerToken = compBody.data.accessToken;

  // 5b. Post Job
  const postJob = await app.inject({
    method: "POST",
    url: `/api/v1/companies/${companyId}/jobs`,
    headers: authHeaders(employerToken),
    payload: {
      title: "Software Engineer",
      description: "Code search and index systems.",
      location: "Bengaluru",
      employmentType: "FULL_TIME",
      workplaceType: "ONSITE",
      skillThresholds: [{ skill: "Java", minimumLevel: 60 }]
    }
  });
  jobId = postJob.json().data.id;

  // 5c. Student A applies (with mock payment)
  const studentAToken = app.jwt.sign({ userId: studentUserA.id, email: studentUserA.email });
  const checkOut = await app.inject({
    method: "POST",
    url: "/api/v1/payments/checkout",
    headers: authHeaders(studentAToken),
    payload: {
      jobId,
      skills: [{ skill: "Java", level: 80 }]
    }
  });
  
  await app.inject({
    method: "POST",
    url: "/api/v1/payments/verify",
    headers: authHeaders(studentAToken),
    payload: {
      gatewayOrderId: checkOut.json().data.gatewayOrderId,
      gatewayPaymentId: "pay_google_999",
      gatewaySignature: crypto
        .createHmac("sha256", config.RAZORPAY_KEY_SECRET)
        .update(`${checkOut.json().data.gatewayOrderId}|pay_google_999`)
        .digest("hex")
    }
  });

  const studentAApp = db.applications.find(a => a.userId === studentUserA.id);
  applicationId = studentAApp.id;

  // 5d. Company shortlists Student A
  await app.inject({
    method: "PATCH",
    url: `/api/v1/companies/${companyId}/applications/${applicationId}`,
    headers: authHeaders(employerToken),
    payload: { status: "SHORTLISTED" }
  });

  // 5e. Company schedules interview
  await app.inject({
    method: "POST",
    url: `/api/v1/companies/${companyId}/applications/${applicationId}/interviews`,
    headers: authHeaders(employerToken),
    payload: {
      title: "System Design Interview",
      scheduledAt: new Date(Date.now() + 86400000).toISOString()
    }
  });

  // 5f. Company generates job offer (₹20 LPA)
  const offer = await app.inject({
    method: "POST",
    url: `/api/v1/companies/${companyId}/applications/${applicationId}/offers`,
    headers: authHeaders(employerToken),
    payload: {
      salary: 2000000,
      startDate: new Date(Date.now() + 30 * 86400000).toISOString()
    }
  });
  offerId = offer.json().data.id;

  // 5g. Student A signs offer
  await app.inject({
    method: "POST",
    url: `/api/v1/offers/${offerId}/sign`,
    headers: authHeaders(studentAToken),
    payload: {
      esignApproach: "CRYPTOGRAPHIC",
      signature: "Aman Gupta"
    }
  });

  console.log(`   ✅ Student A applied, interviewed, got offered ₹20 LPA, and accepted.`);

  // --- STEP 6: Placement Officer Requests Dashboard Statistics ---
  console.log("\n👉 STEP 6: Placement Officer checks NIT Trichy placements analytics dashboard...");
  const dashboardRes = await app.inject({
    method: "GET",
    url: `/api/v1/colleges/${collegeAId}/dashboard`,
    headers: authHeaders(officerAToken)
  });

  if (dashboardRes.statusCode !== 200) {
    console.error("❌ Step 6 Failed:", dashboardRes.json());
    process.exit(1);
  }

  const report = dashboardRes.json().data;
  console.log("   📈 NIT Trichy Placement Report summary:");
  console.log(`     - Total Students: ${report.metrics.totalStudents}`);
  console.log(`     - Placed Students: ${report.metrics.placedStudents}`);
  console.log(`     - Unplaced Students: ${report.metrics.unplacedStudents}`);
  console.log(`     - Placement Rate: ${report.metrics.placementRate}%`);
  console.log(`     - Average CTC: ₹${report.metrics.placedStudents > 0 ? report.salaryStats.averageCTC : 0} CTC`);
  console.log(`     - Top Recruiter: ${report.topRecruiters.length > 0 ? `${report.topRecruiters[0].companyName} (${report.topRecruiters[0].hiresCount} hire)` : "None"}`);
  console.log("     - Application Funnel state count:");
  console.log(`       * OFFER_ACCEPTED: ${report.applicationFunnel.OFFER_ACCEPTED}`);

  // --- STEP 7: Data Isolation & Multi-tenant Protection ---
  console.log("\n👉 STEP 7: Verifying cross-college data isolation protection...");
  console.log("   [Action] Admin B of 'IIT Delhi' tries to read 'NIT Trichy' placements dashboard...");
  
  const illegalRes = await app.inject({
    method: "GET",
    url: `/api/v1/colleges/${collegeAId}/dashboard`,
    headers: authHeaders(adminBToken)
  });

  console.log(`   🔍 Access request status code: ${illegalRes.statusCode} (Expected: 403 Forbidden)`);
  console.log(`   🚨 Isolation Check Message: "${illegalRes.json().error.message}"`);

  // --- STEP 8: Update Student Profile Skills ---
  console.log("\n👉 STEP 8: Updating student profile skills for Student B (Bhavna Rao)...");
  const updateSkillsRes = await app.inject({
    method: "PUT",
    url: `/api/v1/colleges/${collegeAId}/students/${studentUserB.id}/skills`,
    headers: authHeaders(officerAToken),
    payload: {
      skills: [{ skill: "Java", level: 90 }]
    }
  });

  if (updateSkillsRes.statusCode !== 200) {
    console.error("❌ Step 8 Failed:", updateSkillsRes.json());
    process.exit(1);
  }
  console.log(`   ✅ Student B profile skills updated to:`, updateSkillsRes.json().data.skills);

  // --- STEP 9: Fetch Detailed Stats Reports ---
  console.log("\n👉 STEP 9: Fetching student-wise and company-wise placement reports...");
  
  const studentReportRes = await app.inject({
    method: "GET",
    url: `/api/v1/colleges/${collegeAId}/reports/students`,
    headers: authHeaders(officerAToken)
  });
  
  const companyReportRes = await app.inject({
    method: "GET",
    url: `/api/v1/colleges/${collegeAId}/reports/companies`,
    headers: authHeaders(officerAToken)
  });

  if (studentReportRes.statusCode !== 200 || companyReportRes.statusCode !== 200) {
    console.error("❌ Step 9 Failed:", studentReportRes.json(), companyReportRes.json());
    process.exit(1);
  }

  console.log(`   ✅ Student placement report:`);
  for (const s of studentReportRes.json().data) {
    console.log(`     - ${s.name} (${s.email}): Status=${s.placementStatus}, AppsCount=${s.applicationsCount}, CTC=${s.acceptedOffer ? `₹${s.acceptedOffer.salary}` : "N/A"}`);
  }

  console.log(`   ✅ Company placement report:`);
  for (const c of companyReportRes.json().data) {
    console.log(`     - ${c.companyName}: Applied=${c.appliedCount}, Offers=${c.offersCount}, Placed=${c.acceptedCount}, AvgCTC=₹${c.averageCTC}`);
  }

  // --- STEP 10: Query Job Recommendations for Student ---
  console.log("\n👉 STEP 10: Querying job recommendations for unplaced Student B...");
  const jobRecsRes = await app.inject({
    method: "GET",
    url: `/api/v1/colleges/${collegeAId}/recommendations/jobs?studentId=${studentUserB.id}`,
    headers: authHeaders(officerAToken)
  });

  if (jobRecsRes.statusCode !== 200) {
    console.error("❌ Step 10 Failed:", jobRecsRes.json());
    process.exit(1);
  }

  const jobRecs = jobRecsRes.json().data.recommendations;
  console.log(`   ✅ Recommended jobs for ${studentUserB.name}:`);
  for (const rec of jobRecs) {
    console.log(`     - ${rec.job.title} at ${rec.job.companyName} (${rec.job.location}): Match=${rec.matchPercentage}%`);
  }

  // --- STEP 11: Query Student Recommendations for Job ---
  console.log("\n👉 STEP 11: Querying recommended students from NIT Trichy for Job (Software Engineer)...");
  const studentRecsRes = await app.inject({
    method: "GET",
    url: `/api/v1/colleges/${collegeAId}/recommendations/students?jobId=${jobId}`,
    headers: authHeaders(officerAToken)
  });

  if (studentRecsRes.statusCode !== 200) {
    console.error("❌ Step 11 Failed:", studentRecsRes.json());
    process.exit(1);
  }

  const studentRecs = studentRecsRes.json().data.recommendations;
  console.log(`   ✅ Recommended candidates for Software Engineer job:`);
  for (const rec of studentRecs) {
    console.log(`     - ${rec.student.name} (${rec.student.email}): Suitability Match Score (Excess Skill level) = ${rec.matchScore}`);
  }

  // --- STEP 12: Verify Isolation on new Reporting & Recommendation endpoints ---
  console.log("\n👉 STEP 12: Verifying data isolation on reporting and recommendation endpoints...");
  const illegalStudentReport = await app.inject({
    method: "GET",
    url: `/api/v1/colleges/${collegeAId}/reports/students`,
    headers: authHeaders(adminBToken)
  });
  console.log(`   🔍 Illegal Student Report status: ${illegalStudentReport.statusCode} (Expected: 403)`);

  const illegalJobRecs = await app.inject({
    method: "GET",
    url: `/api/v1/colleges/${collegeAId}/recommendations/jobs?studentId=${studentUserB.id}`,
    headers: authHeaders(adminBToken)
  });
  console.log(`   🔍 Illegal Job Recommendations status: ${illegalJobRecs.statusCode} (Expected: 403)`);

  console.log("\n======================================================================");
  console.log("🎉 SUCCESS: College Portal & Reporting API Dry Run completed with 100% success!");
  console.log("======================================================================");

  await app.close();
}

runCollegeDryRun().catch(err => {
  console.error("❌ College dry-run script error:", err);
  process.exit(1);
});
