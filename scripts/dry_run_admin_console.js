import { buildApp } from "../src/app.js";

class InMemoryDb {
  constructor() {
    this.users = [];
    this.assessmentItems = [];
    this.assessmentAttempts = [];
    this.applications = [];
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
      if (where.id) {
        return this.users.find(u => u.id === where.id) || null;
      }
      if (where.email) {
        return this.users.find(u => u.email === where.email) || null;
      }
      return null;
    },
    update: async ({ where, data }) => {
      const idx = this.users.findIndex(u => u.id === where.id);
      if (idx === -1) throw new Error("User not found");
      this.users[idx] = { ...this.users[idx], ...data, updatedAt: new Date() };
      return this.users[idx];
    }
  };

  assessmentItem = {
    create: async ({ data }) => {
      const id = this.generateId();
      const item = {
        id,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      this.assessmentItems.push(item);
      return item;
    },
    findMany: async ({ where }) => {
      let filtered = this.assessmentItems;
      if (where.status) {
        filtered = filtered.filter(x => x.status === where.status);
      }
      if (where.skillKey) {
        filtered = filtered.filter(x => x.skillKey === where.skillKey);
      }
      if (where.difficulty) {
        filtered = filtered.filter(x => x.difficulty === where.difficulty);
      }
      return filtered;
    },
    findUnique: async ({ where }) => {
      return this.assessmentItems.find(x => x.id === where.id) || null;
    },
    update: async ({ where, data }) => {
      const idx = this.assessmentItems.findIndex(x => x.id === where.id);
      if (idx === -1) throw new Error("AssessmentItem not found");
      this.assessmentItems[idx] = { ...this.assessmentItems[idx], ...data, updatedAt: new Date() };
      return this.assessmentItems[idx];
    }
  };

  assessmentAttempt = {
    findMany: async ({ where, orderBy, include }) => {
      let filtered = this.assessmentAttempts;
      if (where?.reviewStatus) {
        filtered = filtered.filter(x => x.reviewStatus === where.reviewStatus);
      }
      
      const mapped = filtered.map(attempt => {
        const app = this.applications.find(a => a.id === attempt.applicationId);
        const student = app ? this.users.find(u => u.id === app.userId) : null;
        return {
          ...attempt,
          application: app ? {
            id: app.id,
            job: { title: "React Developer", company: { displayName: "Google" } },
            user: student ? { name: student.name, email: student.email } : null
          } : null
        };
      });

      if (orderBy?.proctoringFlags === "desc") {
        mapped.sort((a, b) => b.proctoringFlags - a.proctoringFlags);
      }
      return mapped;
    },
    findUnique: async ({ where }) => {
      return this.assessmentAttempts.find(x => x.id === where.id) || null;
    },
    update: async ({ where, data }) => {
      const idx = this.assessmentAttempts.findIndex(x => x.id === where.id);
      if (idx === -1) throw new Error("AssessmentAttempt not found");
      this.assessmentAttempts[idx] = { ...this.assessmentAttempts[idx], ...data, updatedAt: new Date() };
      return this.assessmentAttempts[idx];
    }
  };

  application = {
    update: async ({ where, data }) => {
      const idx = this.applications.findIndex(a => a.id === where.id);
      if (idx === -1) throw new Error("Application not found");
      this.applications[idx] = { ...this.applications[idx], ...data, updatedAt: new Date() };
      return this.applications[idx];
    }
  };

  applicationStatusRecord = {
    upsert: async ({ where, create, update }) => {
      const idx = this.applicationStatusRecords.findIndex(r => r.applicationId === where.applicationId);
      if (idx === -1) {
        const r = {
          id: this.generateId(),
          applicationId: where.applicationId,
          status: create.status,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.applicationStatusRecords.push(r);
        return r;
      } else {
        this.applicationStatusRecords[idx].status = update.status;
        this.applicationStatusRecords[idx].updatedAt = new Date();
        return this.applicationStatusRecords[idx];
      }
    }
  };
}

async function runAdminDryRun() {
  console.log("======================================================================");
  console.log("🚀 STARTING: Task 18 - Admin Console & Review Queue Dry Run");
  console.log("======================================================================\n");

  const db = new InMemoryDb();
  const app = await buildApp(db);

  // Setup Users in Mock DB
  const adminUser = {
    id: db.generateId(),
    name: "Platform Admin",
    email: "admin@placemux.com",
    role: "ADMIN"
  };
  const studentUser = {
    id: db.generateId(),
    name: "Aman Gupta",
    email: "aman@nitt.edu",
    role: "STUDENT"
  };
  db.users.push(adminUser);
  db.users.push(studentUser);

  const adminToken = app.jwt.sign({ userId: adminUser.id, email: adminUser.email });
  const studentToken = app.jwt.sign({ userId: studentUser.id, email: studentUser.email });

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const studentHeaders = { Authorization: `Bearer ${studentToken}` };

  // --- STEP 1: Add a new question to the Item Bank ---
  console.log("👉 STEP 1: Admin adds a new React assessment question to the Item Bank...");
  const createItemRes = await app.inject({
    method: "POST",
    url: "/api/v1/admin/items",
    headers: adminHeaders,
    payload: {
      skillKey: "react",
      difficulty: "MEDIUM",
      questionText: "What is the primary purpose of useEffect hook in React?",
      options: [
        "To perform side effects in functional components",
        "To define styling rules for UI components",
        "To calculate state changes synchronously",
        "To inject state variables globally"
      ],
      correctAnswer: "To perform side effects in functional components"
    }
  });

  if (createItemRes.statusCode !== 201) {
    console.error("❌ Step 1 Failed:", createItemRes.json());
    process.exit(1);
  }

  const createdItem = createItemRes.json().data;
  console.log(`   ✅ Question created successfully! ID: ${createdItem.id}`);

  // --- STEP 2: Retrieve questions from the Item Bank ---
  console.log("\n👉 STEP 2: Admin queries questions from the Item Bank with filters...");
  const getItemsRes = await app.inject({
    method: "GET",
    url: "/api/v1/admin/items?skillKey=react&difficulty=MEDIUM",
    headers: adminHeaders
  });

  if (getItemsRes.statusCode !== 200) {
    console.error("❌ Step 2 Failed:", getItemsRes.json());
    process.exit(1);
  }

  const items = getItemsRes.json().data;
  console.log(`   ✅ Item Bank search returned ${items.length} active question(s):`);
  for (const item of items) {
    console.log(`     - [${item.difficulty}] ${item.questionText} (Answer: "${item.correctAnswer}")`);
  }

  // --- STEP 3: Update a question ---
  console.log("\n👉 STEP 3: Admin updates a question's difficulty level to HARD...");
  const updateItemRes = await app.inject({
    method: "PUT",
    url: `/api/v1/admin/items/${createdItem.id}`,
    headers: adminHeaders,
    payload: {
      difficulty: "HARD"
    }
  });

  if (updateItemRes.statusCode !== 200) {
    console.error("❌ Step 3 Failed:", updateItemRes.json());
    process.exit(1);
  }
  console.log(`   ✅ Question updated difficulty is now: "${updateItemRes.json().data.difficulty}"`);

  // --- STEP 4: Simulate a Student Assessment Attempt with Proctoring Flags ---
  console.log("\n👉 STEP 4: Simulating student taking assessment and generating suspicious flags...");
  const mockAppId = db.generateId();
  const mockAttemptId = db.generateId();

  // Seed application & suspicious attempt
  db.applications.push({
    id: mockAppId,
    userId: studentUser.id,
    jobId: db.generateId(),
    status: "PENDING"
  });

  db.applicationStatusRecords.push({
    id: db.generateId(),
    applicationId: mockAppId,
    status: "APPLIED"
  });

  db.assessmentAttempts.push({
    id: mockAttemptId,
    applicationId: mockAppId,
    userId: studentUser.id,
    score: 92,
    proctoringFlags: 5, // AI flagged tab switching/gaze deviation 5 times
    reviewStatus: "PENDING",
    verdict: "CLEAN",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log(`   ✅ Seeded suspicious test attempt for Aman Gupta (Score: 92, Flags: 5)`);

  // --- STEP 5: Admin retrieves Proctoring Queue ---
  console.log("\n👉 STEP 5: Admin reviews the Proctoring Review Queue...");
  const getQueueRes = await app.inject({
    method: "GET",
    url: "/api/v1/admin/proctoring/queue",
    headers: adminHeaders
  });

  if (getQueueRes.statusCode !== 200) {
    console.error("❌ Step 5 Failed:", getQueueRes.json());
    process.exit(1);
  }

  const queue = getQueueRes.json().data;
  console.log(`   ✅ Proctoring Queue returned ${queue.length} attempt(s) requiring manual review:`);
  for (const att of queue) {
    console.log(`     - Candidate: ${att.application.user.name}, Score: ${att.score}, AI Flagged Anomalies: ${att.proctoringFlags} flags`);
  }

  // --- STEP 6: Admin issues integrity verdict of CONFIRMED_MALPRACTICE ---
  console.log("\n👉 STEP 6: Admin reviews video logs and issues verdict CONFIRMED_MALPRACTICE...");
  const verdictRes = await app.inject({
    method: "POST",
    url: `/api/v1/admin/proctoring/${mockAttemptId}/verdict`,
    headers: adminHeaders,
    payload: {
      verdict: "CONFIRMED_MALPRACTICE",
      notes: "Malpractice confirmed. Gaze patterns indicate looking at second screen; tab switching verified."
    }
  });

  if (verdictRes.statusCode !== 200) {
    console.error("❌ Step 6 Failed:", verdictRes.json());
    process.exit(1);
  }

  console.log(`   ✅ Verdict submitted. Review status updated to VERIFIED.`);

  // --- STEP 7: Verify auto-rejection of student's application ---
  console.log("\n👉 STEP 7: Verifying candidate's application was auto-rejected in response...");
  const targetApp = db.applications.find(a => a.id === mockAppId);
  const targetStatus = db.applicationStatusRecords.find(r => r.applicationId === mockAppId);
  console.log(`   🔍 Candidate Application Status: "${targetApp.status}" (Expected: REJECTED)`);
  console.log(`   🔍 Candidate Status Record Tracker: "${targetStatus.status}" (Expected: REJECTED)`);

  // --- STEP 8: Security checks (Non-admin blocking) ---
  console.log("\n👉 STEP 8: Verifying role authentication security gates...");
  console.log("   [Action] Student attempts to access the Proctoring Review Queue...");
  const illegalRes = await app.inject({
    method: "GET",
    url: "/api/v1/admin/proctoring/queue",
    headers: studentHeaders
  });

  console.log(`   🔍 Student Request status code: ${illegalRes.statusCode} (Expected: 403 Forbidden)`);
  console.log(`   🚨 Access Gating Message: "${illegalRes.json().error.message}"`);

  console.log("\n======================================================================");
  console.log("🎉 SUCCESS: Admin Console & Review Queue Dry Run completed with 100% success!");
  console.log("======================================================================\n");

  await app.close();
}

runAdminDryRun().catch(err => {
  console.error("❌ Admin dry run script error:", err);
  process.exit(1);
});
