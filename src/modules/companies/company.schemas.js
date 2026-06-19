import { z } from "zod";

export const companyIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Company ID must be a MongoDB ObjectId"),
});

export const updateProfileSchema = z
  .object({
    description: z.string().trim().max(2000).nullable().optional(),
    logoUrl: z.string().url().max(2048).nullable().optional(),
    website: z.string().url().max(2048).nullable().optional(),
    addressLine1: z.string().trim().max(200).nullable().optional(),
    addressLine2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    state: z.string().trim().max(100).nullable().optional(),
    postalCode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, "Enter a valid Indian PIN code")
      .nullable()
      .optional(),
    country: z.string().trim().length(2).toUpperCase().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one profile field",
  });

const documentTypes = [
  "CERTIFICATE_OF_INCORPORATION",
  "GST_CERTIFICATE",
  "PAN_CARD",
  "ADDRESS_PROOF",
  "OTHER",
];

export const submitKycSchema = z.object({
  documents: z
    .array(
      z.object({
        type: z.enum(documentTypes),
        storageKey: z.string().trim().min(1).max(500),
        fileName: z.string().trim().min(1).max(255),
        mimeType: z
          .enum(["application/pdf", "image/jpeg", "image/png"])
          .describe("Only PDF, JPEG and PNG metadata is accepted"),
      }),
    )
    .min(1)
    .max(10)
    .refine(
      (documents) =>
        new Set(documents.map((document) => document.type)).size ===
        documents.length,
      "Each KYC document type may only be submitted once",
    ),
});
