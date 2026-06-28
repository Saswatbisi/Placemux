import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const fakeUser = {
  id: "685400000000000000000001",
  name: "TPO Admin",
  email: "admin@college.edu",
};

const fakeCollege = {
  id: "685400000000000000000002",
  name: "National Institute of Technology",
  code: "NIT",
  status: "ACTIVE",
};

const fakeMembership = {
  id: "685400000000000000000003",
  userId: fakeUser.id,
  collegeId: fakeCollege.id,
  role: "ADMIN",
  college: fakeCollege,
};

function createFakeDb() {
  const db = {
    $disconnect: vi.fn(),
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    college: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    collegeMembership: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    application: {
      findMany: vi.fn(),
    },
    job: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  db.$transaction = vi.fn().mockImplementation((callback) => callback(db));
  return db;
}

async function getAuthHeaders(
  app,
  payload = { userId: fakeUser.id, email: fakeUser.email },
) {
  const token = app.jwt.sign(payload);
  return {
    Authorization: `Bearer ${token}`,
  };
}

describe("College Portal API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  // ===== SIGNUP =====

  it("POST /api/v1/colleges/signup — registers college & admin successfully", async () => {
    const db = createFakeDb();
    db.user.findUnique.mockResolvedValue(null);
    db.college.findFirst.mockResolvedValue(null);
    db.user.create.mockResolvedValue(fakeUser);
    db.college.create.mockResolvedValue(fakeCollege);

    const app = await buildApp(db);
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/colleges/signup",
      payload: {
        admin: {
          name: "TPO Admin",
          email: "admin@college.edu",
          password: "SecurePassword123",
        },
        college: {
          name: "National Institute of Technology",
          code: "NIT",
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.college.id).toBe(fakeCollege.id);
    expect(body.data.user.id).toBe(fakeUser.id);
    expect(body.data.accessToken).toBeDefined();
  });

  // ===== ROLE & MEMBERSHIP SECURITY =====

  it("POST /api/v1/colleges/:id/members — allows admin to add another TPO officer", async () => {
    const db = createFakeDb();
    // Caller is ADMIN of this college
    db.collegeMembership.findUnique.mockResolvedValue(fakeMembership);

    // Target user to be added
    const targetUser = { id: "user_2", name: "Officer User", email: "officer@college.edu" };
    db.user.findUnique.mockResolvedValue(targetUser);

    const expectedMembership = {
      id: "membership_new",
      userId: targetUser.id,
      collegeId: fakeCollege.id,
      role: "OFFICER",
      user: targetUser,
    };
    db.collegeMembership.upsert.mockResolvedValue(expectedMembership);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/colleges/${fakeCollege.id}/members`,
      headers: authHeaders,
      payload: {
        email: "officer@college.edu",
        role: "OFFICER",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.role).toBe("OFFICER");
    expect(db.collegeMembership.upsert).toHaveBeenCalled();
  });

  it("POST /api/v1/colleges/:id/members — blocks non-admin additions", async () => {
    const db = createFakeDb();
    // Caller is OFFICER of this college, not ADMIN
    db.collegeMembership.findUnique.mockResolvedValue({
      ...fakeMembership,
      role: "OFFICER",
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/colleges/${fakeCollege.id}/members`,
      headers: authHeaders,
      payload: {
        email: "another@college.edu",
        role: "OFFICER",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/colleges/:id/dashboard — blocks cross-college access", async () => {
    const db = createFakeDb();
    // Caller is NOT a member of requested college
    db.collegeMembership.findUnique.mockResolvedValue(null);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, {
      userId: "intruder_user_id",
      email: "spy@othercollege.edu",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/colleges/${fakeCollege.id}/dashboard`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain("not a member");
  });

  // ===== DASHBOARD ANALYTICS REPORT =====

  it("GET /api/v1/colleges/:id/dashboard — returns placement dashboard stats correctly", async () => {
    const db = createFakeDb();
    db.collegeMembership.findUnique.mockResolvedValue(fakeMembership);

    // List of students under this college
    const student1 = { id: "student_1", name: "Student A", email: "student_a@college.edu" };
    const student2 = { id: "student_2", name: "Student B", email: "student_b@college.edu" };
    db.user.findMany.mockResolvedValue([student1, student2]);

    // Student applications, offers, and company details
    const app1 = {
      id: "app_1",
      userId: "student_1",
      status: "PENDING",
      statusRecord: { status: "OFFER_ACCEPTED" },
      offer: {
        id: "offer_1",
        salary: 1200000, // ₹12 LPA
        status: "ACCEPTED",
      },
      job: {
        company: { displayName: "Google" },
      },
    };

    const app2 = {
      id: "app_2",
      userId: "student_2",
      status: "PENDING",
      statusRecord: { status: "OFFER_ACCEPTED" },
      offer: {
        id: "offer_2",
        salary: 1600000, // ₹16 LPA
        status: "ACCEPTED",
      },
      job: {
        company: { displayName: "Amazon" },
      },
    };

    db.application.findMany.mockResolvedValue([app1, app2]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/colleges/${fakeCollege.id}/dashboard`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().data;

    // Metrics
    expect(result.metrics.totalStudents).toBe(2);
    expect(result.metrics.placedStudents).toBe(2);
    expect(result.metrics.unplacedStudents).toBe(0);
    expect(result.metrics.placementRate).toBe(100);

    // CTC stats
    expect(result.salaryStats.averageCTC).toBe(1400000); // (12 + 16) / 2
    expect(result.salaryStats.highestCTC).toBe(1600000);
    expect(result.salaryStats.lowestCTC).toBe(1200000);
    expect(result.salaryStats.medianCTC).toBe(1400000);

    // Recruiters breakdown
    expect(result.topRecruiters).toHaveLength(2);
    expect(result.topRecruiters[0].companyName).toBe("Amazon");
    expect(result.topRecruiters[0].hiresCount).toBe(1);

    expect(result.applicationFunnel.OFFER_ACCEPTED).toBe(2);
  });

  // ===== STUDENT PROFILE SKILLS =====

  it("PUT /api/v1/colleges/:id/students/:studentId/skills — updates student profile skills", async () => {
    const db = createFakeDb();
    db.collegeMembership.findUnique.mockResolvedValue(fakeMembership);

    const studentUser = {
      id: "685400000000000000000005",
      name: "Student A",
      email: "student_a@college.edu",
      collegeId: fakeCollege.id,
    };
    db.user.findUnique.mockResolvedValue(studentUser);

    const updatedUser = {
      ...studentUser,
      skillsJson: JSON.stringify([{ skill: "React", skillKey: "react", level: 80 }]),
    };
    db.user.update.mockResolvedValue(updatedUser);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/colleges/${fakeCollege.id}/students/685400000000000000000005/skills`,
      headers: authHeaders,
      payload: {
        skills: [{ skill: "React", level: 80 }],
      },
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().data;
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].skill).toBe("React");
    expect(result.skills[0].level).toBe(80);
    expect(db.user.update).toHaveBeenCalled();
  });

  // ===== PLACEMENT REPORTING =====

  it("GET /api/v1/colleges/:id/reports/students — returns student placement details", async () => {
    const db = createFakeDb();
    db.collegeMembership.findUnique.mockResolvedValue(fakeMembership);

    const student1 = {
      id: "student_1",
      name: "Student A",
      email: "student_a@college.edu",
      phone: "+919876543210",
      applications: [
        {
          id: "app_1",
          status: "PENDING",
          offer: {
            id: "offer_1",
            salary: 1200000,
            status: "ACCEPTED",
            esignApproach: "CRYPTOGRAPHIC",
            startDate: new Date("2026-07-28T00:00:00.000Z"),
            application: {
              job: {
                company: { displayName: "Google" },
              },
            },
          },
        },
      ],
    };
    db.user.findMany.mockResolvedValue([student1]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/colleges/${fakeCollege.id}/reports/students`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().data;
    expect(result).toHaveLength(1);
    expect(result[0].placementStatus).toBe("PLACED");
    expect(result[0].acceptedOffer.companyName).toBe("Google");
    expect(result[0].acceptedOffer.salary).toBe(1200000);
  });

  it("GET /api/v1/colleges/:id/reports/companies — returns company-wise placement metrics", async () => {
    const db = createFakeDb();
    db.collegeMembership.findUnique.mockResolvedValue(fakeMembership);

    db.user.findMany.mockResolvedValue([{ id: "student_1" }]);

    const app1 = {
      id: "app_1",
      userId: "student_1",
      offer: {
        id: "offer_1",
        salary: 1500000,
        status: "ACCEPTED",
      },
      job: {
        company: { displayName: "Google" },
      },
    };
    db.application.findMany.mockResolvedValue([app1]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/colleges/${fakeCollege.id}/reports/companies`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().data;
    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe("Google");
    expect(result[0].appliedCount).toBe(1);
    expect(result[0].acceptedCount).toBe(1);
    expect(result[0].averageCTC).toBe(1500000);
  });

  // ===== RECOMMENDATIONS =====

  it("GET /api/v1/colleges/:id/recommendations/jobs — recommends jobs for a student", async () => {
    const db = createFakeDb();
    db.collegeMembership.findUnique.mockResolvedValue(fakeMembership);

    const studentUser = {
      id: "685400000000000000000005",
      name: "Student A",
      email: "student_a@college.edu",
      collegeId: fakeCollege.id,
      skillsJson: JSON.stringify([{ skill: "React", skillKey: "react", level: 80 }]),
    };
    db.user.findUnique.mockResolvedValue(studentUser);

    const job = {
      id: "685400000000000000000006",
      title: "React Developer",
      location: "Bengaluru",
      employmentType: "FULL_TIME",
      workplaceType: "HYBRID",
      company: { displayName: "Google", status: "ACTIVE" },
      skillThresholds: [
        { skill: "React", skillKey: "react", minimumLevel: 70 },
      ],
    };
    db.job.findMany = vi.fn().mockResolvedValue([job]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/colleges/${fakeCollege.id}/recommendations/jobs?studentId=685400000000000000000005`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().data;
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].job.title).toBe("React Developer");
    expect(result.recommendations[0].matchPercentage).toBe(100);
  });

  it("GET /api/v1/colleges/:id/recommendations/students — recommends students for a job", async () => {
    const db = createFakeDb();
    db.collegeMembership.findUnique.mockResolvedValue(fakeMembership);

    const job = {
      id: "685400000000000000000006",
      title: "React Developer",
      status: "PUBLISHED",
      company: { displayName: "Google", status: "ACTIVE" },
      skillThresholds: [
        { skill: "React", skillKey: "react", minimumLevel: 70 },
      ],
    };
    db.job.findUnique.mockResolvedValue(job);

    const studentUser = {
      id: "685400000000000000000005",
      name: "Student A",
      email: "student_a@college.edu",
      collegeId: fakeCollege.id,
      skillsJson: JSON.stringify([{ skill: "React", skillKey: "react", level: 90 }]),
    };
    db.user.findMany.mockResolvedValue([studentUser]);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/colleges/${fakeCollege.id}/recommendations/students?jobId=685400000000000000000006`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().data;
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].student.name).toBe("Student A");
    expect(result.recommendations[0].matchScore).toBe(20);
  });
});
