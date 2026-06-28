import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a MongoDB ObjectId");

export const collegeSignupSchema = z
  .object({
    admin: z.object({
      name: z.string().trim().min(2, "Name must be at least 2 characters"),
      email: z.string().trim().email("Invalid email address"),
      password: z.string().min(8, "Password must be at least 8 characters"),
      phone: z.string().optional(),
    }),
    college: z.object({
      name: z.string().trim().min(2, "College name must be at least 2 characters"),
      code: z.string().trim().toUpperCase().min(2, "College code must be at least 2 characters"),
    }),
  })
  .strict();

export const addMemberSchema = z
  .object({
    email: z.string().trim().email("Invalid email address"),
    role: z.enum(["ADMIN", "OFFICER"]),
  })
  .strict();

export const addStudentSchema = z
  .object({
    email: z.string().trim().email("Invalid email address"),
  })
  .strict();

export const joinCollegeSchema = z
  .object({
    collegeId: objectIdSchema,
  })
  .strict();

export const collegeIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const studentIdParamsSchema = z
  .object({
    id: objectIdSchema,
    studentId: objectIdSchema,
  })
  .strict();

export const updateStudentSkillsSchema = z
  .object({
    skills: z.array(
      z.object({
        skill: z.string().trim().min(1, "Skill name is required"),
        level: z.number().int().min(1).max(100, "Level must be between 1 and 100"),
      })
    ),
  })
  .strict();

export const jobRecommendationsQuerySchema = z
  .object({
    studentId: objectIdSchema,
  })
  .strict();

export const studentRecommendationsQuerySchema = z
  .object({
    jobId: objectIdSchema,
  })
  .strict();

