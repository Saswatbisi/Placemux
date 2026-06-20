import { describe, expect, it } from "vitest";
import {
  applyToJobSchema,
  updateApplicationStatusSchema,
} from "../src/modules/applications/application.schemas.js";

describe("applyToJobSchema validation", () => {
  it("accepts a valid application input", () => {
    const input = {
      skills: [
        { skill: "Node.js", level: 80 },
        { skill: "PostgreSQL", level: 60 },
      ],
    };
    const result = applyToJobSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects empty skills array", () => {
    const input = {
      skills: [],
    };
    const result = applyToJobSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate skill names (case-insensitive)", () => {
    const input = {
      skills: [
        { skill: "Node.js", level: 80 },
        { skill: "node.js", level: 60 },
      ],
    };
    const result = applyToJobSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects levels out of bounds (0 and 101)", () => {
    const lowResult = applyToJobSchema.safeParse({
      skills: [{ skill: "React", level: 0 }],
    });
    expect(lowResult.success).toBe(false);

    const highResult = applyToJobSchema.safeParse({
      skills: [{ skill: "React", level: 101 }],
    });
    expect(highResult.success).toBe(false);
  });

  it("rejects non-integer levels", () => {
    const result = applyToJobSchema.safeParse({
      skills: [{ skill: "React", level: 75.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra properties in skills array objects due to strict mode", () => {
    const result = applyToJobSchema.safeParse({
      skills: [{ skill: "React", level: 80, extra: "field" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra properties in request body due to strict mode", () => {
    const result = applyToJobSchema.safeParse({
      skills: [{ skill: "React", level: 80 }],
      extra: "field",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateApplicationStatusSchema validation", () => {
  it("accepts valid status values", () => {
    expect(updateApplicationStatusSchema.safeParse({ status: "PENDING" }).success).toBe(true);
    expect(updateApplicationStatusSchema.safeParse({ status: "SHORTLISTED" }).success).toBe(true);
    expect(updateApplicationStatusSchema.safeParse({ status: "REJECTED" }).success).toBe(true);
  });

  it("rejects invalid status values", () => {
    expect(updateApplicationStatusSchema.safeParse({ status: "COMPLETED" }).success).toBe(false);
    expect(updateApplicationStatusSchema.safeParse({ status: 123 }).success).toBe(false);
  });

  it("rejects extra properties due to strict mode", () => {
    const result = updateApplicationStatusSchema.safeParse({
      status: "SHORTLISTED",
      extra: "field",
    });
    expect(result.success).toBe(false);
  });
});
