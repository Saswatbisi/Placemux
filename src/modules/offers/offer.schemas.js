import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a MongoDB ObjectId");

export const createOfferSchema = z
  .object({
    salary: z.number().int().positive("Salary must be a positive integer"),
    startDate: z
      .string()
      .datetime({ message: "Start date must be a valid ISO datetime string" })
      .refine((val) => new Date(val) > new Date(), {
        message: "Start date must be in the future",
      }),
    probationPeriod: z
      .number()
      .int()
      .positive("Probation period must be a positive integer")
      .optional()
      .default(3),
  })
  .strict();

export const signOfferSchema = z
  .object({
    esignApproach: z.enum(["CRYPTOGRAPHIC", "THIRD_PARTY"]),
    signature: z.string().trim().min(2, "Signature must be at least 2 characters").optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.esignApproach === "CRYPTOGRAPHIC" && !data.signature) {
      context.addIssue({
        code: "custom",
        path: ["signature"],
        message: "Signature is required for cryptographic signing",
      });
    }
  });

export const offerIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const generateOfferParamsSchema = z
  .object({
    companyId: objectIdSchema,
    applicationId: objectIdSchema,
  })
  .strict();
