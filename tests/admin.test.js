import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const fakeAdminUser = {
  id: "685400000000000000000001",
  name: "Platform Admin",
  email: "admin@placemux.com",
  role: "ADMIN",
};

const fakeStudentUser = {
  id: "685400000000000000000002",
  name: "Student User",
  email: "student@college.edu",
  role: "STUDENT",
};

function createFakeDb() {
  const db = {
    $disconnect: vi.fn(),
    user: {
      findUnique: vi.fn(),
    },
    assessmentItem: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    assessmentAttempt: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    application: {
      update: vi.fn(),
    },
    applicationStatusRecord: {
      upsert: vi.fn(),
    },
  };
  db.$transaction = vi.fn().mockImplementation((callback) => callback(db));
  return db;
}

async function getAuthHeaders(app, user) {
  const token = app.jwt.sign({ userId: user.id, email: user.email });
  return {
    Authorization: `Bearer ${token}`,
  };
}

describe("Admin Console API", () => {
  const apps = [];

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps.length = 0;
  });

  // ===== ROLE AUTHORIZATION =====

  it("blocks non-admin users from admin endpoints", async () => {
    const db = createFakeDb();
    db.user.findUnique.mockResolvedValue(fakeStudentUser);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, fakeStudentUser);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/items",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain("platform administrators");
  });

  // ===== ITEM BANK =====

  it("POST /api/v1/admin/items — creates assessment item successfully", async () => {
    const db = createFakeDb();
    db.user.findUnique.mockResolvedValue(fakeAdminUser);

    const fakeItem = {
      id: "685400000000000000000005",
      skillKey: "react",
      difficulty: "MEDIUM",
      questionText: "What is React?",
      optionsJson: JSON.stringify(["Library", "Framework"]),
      correctAnswer: "Library",
      status: "ACTIVE",
    };
    db.assessmentItem.create.mockResolvedValue(fakeItem);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, fakeAdminUser);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/items",
      headers: authHeaders,
      payload: {
        skillKey: "React",
        difficulty: "MEDIUM",
        questionText: "What is React?",
        options: ["Library", "Framework"],
        correctAnswer: "Library",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe(fakeItem.id);
    expect(db.assessmentItem.create).toHaveBeenCalled();
  });

  it("GET /api/v1/admin/items — lists items matching filters", async () => {
    const db = createFakeDb();
    db.user.findUnique.mockResolvedValue(fakeAdminUser);

    const fakeItems = [
      {
        id: "685400000000000000000005",
        skillKey: "react",
        difficulty: "MEDIUM",
        questionText: "What is React?",
        optionsJson: JSON.stringify(["Library", "Framework"]),
        correctAnswer: "Library",
        status: "ACTIVE",
      },
    ];
    db.assessmentItem.findMany.mockResolvedValue(fakeItems);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, fakeAdminUser);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/items?skillKey=react&difficulty=MEDIUM",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().data;
    expect(result).toHaveLength(1);
    expect(result[0].options).toEqual(["Library", "Framework"]);
  });

  // ===== PROCTORING QUEUE & VERDICT =====

  it("GET /api/v1/admin/proctoring/queue — lists attempts pending review", async () => {
    const db = createFakeDb();
    db.user.findUnique.mockResolvedValue(fakeAdminUser);

    const fakeAttempts = [
      {
        id: "685400000000000000000009",
        applicationId: "685400000000000000000010",
        userId: fakeStudentUser.id,
        score: 85,
        proctoringFlags: 4,
        reviewStatus: "PENDING",
        verdict: "CLEAN",
        application: {
          id: "685400000000000000000010",
          job: { title: "React Developer", company: { displayName: "Google" } },
          user: { name: fakeStudentUser.name, email: fakeStudentUser.email },
        },
      },
    ];
    db.assessmentAttempt.findMany.mockResolvedValue(fakeAttempts);

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, fakeAdminUser);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/proctoring/queue",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].proctoringFlags).toBe(4);
  });

  it("POST /api/v1/admin/proctoring/:attemptId/verdict — confirmed malpractice rejects application", async () => {
    const db = createFakeDb();
    db.user.findUnique.mockResolvedValue(fakeAdminUser);

    const fakeAttempt = {
      id: "685400000000000000000009",
      applicationId: "685400000000000000000010",
      userId: fakeStudentUser.id,
      score: 85,
      proctoringFlags: 4,
      reviewStatus: "PENDING",
      verdict: "CLEAN",
    };
    db.assessmentAttempt.findUnique.mockResolvedValue(fakeAttempt);
    db.assessmentAttempt.update.mockResolvedValue({
      ...fakeAttempt,
      verdict: "CONFIRMED_MALPRACTICE",
      reviewStatus: "VERIFIED",
    });

    const app = await buildApp(db);
    apps.push(app);

    const authHeaders = await getAuthHeaders(app, fakeAdminUser);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/proctoring/685400000000000000000009/verdict",
      headers: authHeaders,
      payload: {
        verdict: "CONFIRMED_MALPRACTICE",
        notes: "Confirmed tab switching 15 times.",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.verdict).toBe("CONFIRMED_MALPRACTICE");
    expect(db.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "685400000000000000000010" },
        data: { status: "REJECTED" },
      }),
    );
    expect(db.applicationStatusRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: "685400000000000000000010" },
        update: { status: "REJECTED" },
      }),
    );
  });
});
