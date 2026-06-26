import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a MongoDB ObjectId");

export const createInterviewSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title must be at least 1 character")
      .max(100, "Title is too long"),
    scheduledAt: z
      .string()
      .datetime({
        message: "Scheduled time must be a valid ISO datetime string",
      })
      .refine((val) => new Date(val) > new Date(), {
        message: "Scheduled time must be in the future",
      }),
    duration: z
      .number()
      .int()
      .positive("Duration must be a positive integer")
      .optional()
      .default(30),
    meetingLink: z
      .string()
      .url("Meeting link must be a valid URL")
      .optional()
      .nullable()
      .or(z.literal("")),
    interviewerName: z
      .string()
      .trim()
      .min(1, "Interviewer name cannot be empty")
      .max(100)
      .optional()
      .nullable(),
  })
  .strict();

export const updateInterviewSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title must be at least 1 character")
      .max(100)
      .optional(),
    scheduledAt: z
      .string()
      .datetime({
        message: "Scheduled time must be a valid ISO datetime string",
      })
      .refine((val) => new Date(val) > new Date(), {
        message: "Scheduled time must be in the future",
      })
      .optional(),
    duration: z
      .number()
      .int()
      .positive("Duration must be a positive integer")
      .optional(),
    meetingLink: z
      .string()
      .url("Meeting link must be a valid URL")
      .optional()
      .nullable()
      .or(z.literal("")),
    interviewerName: z.string().trim().min(1).max(100).optional().nullable(),
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  })
  .strict();

export const interviewIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const companyApplicationParamsSchema = z
  .object({
    companyId: objectIdSchema,
    applicationId: objectIdSchema,
  })
  .strict();

export const applicationIdParamsSchema = z
  .object({
    applicationId: objectIdSchema,
  })
  .strict();
