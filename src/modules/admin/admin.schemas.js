import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a MongoDB ObjectId");

export const createAssessmentItemSchema = z
  .object({
    skillKey: z.string().trim().toLowerCase().min(1, "Skill key is required"),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    questionText: z.string().trim().min(5, "Question text must be at least 5 characters"),
    options: z.array(z.string().trim().min(1, "Option content cannot be empty")).min(2, "Must have at least 2 options"),
    correctAnswer: z.string().trim().min(1, "Correct answer is required"),
  })
  .strict();

export const updateAssessmentItemSchema = z
  .object({
    skillKey: z.string().trim().toLowerCase().min(1).optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    questionText: z.string().trim().min(5).optional(),
    options: z.array(z.string().trim().min(1)).min(2).optional(),
    correctAnswer: z.string().trim().min(1).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  })
  .strict();

export const getAssessmentItemsQuerySchema = z
  .object({
    skillKey: z.string().trim().toLowerCase().optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  })
  .strict();

export const submitIntegrityVerdictSchema = z
  .object({
    verdict: z.enum(["CLEAN", "SUSPICIOUS_HEURISTICS", "CONFIRMED_MALPRACTICE"]),
    notes: z.string().trim().optional(),
  })
  .strict();

export const attemptIdParamsSchema = z
  .object({
    attemptId: objectIdSchema,
  })
  .strict();

export const itemIdParamsSchema = z
  .object({
    itemId: objectIdSchema,
  })
  .strict();
