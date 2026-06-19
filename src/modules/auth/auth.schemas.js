import { z } from "zod";

const indianPhone = /^(\+91)?[6-9]\d{9}$/;
const gstin = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const companyTypes = [
  "SOLE_PROPRIETORSHIP",
  "PARTNERSHIP",
  "LLP",
  "PRIVATE_LIMITED",
  "PUBLIC_LIMITED",
  "OTHER",
];

export const companySignupSchema = z.object({
  owner: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: z
      .string()
      .min(10, "Password must contain at least 10 characters")
      .max(72)
      .regex(/[a-z]/, "Password must include a lowercase letter")
      .regex(/[A-Z]/, "Password must include an uppercase letter")
      .regex(/\d/, "Password must include a number"),
    phone: z
      .string()
      .trim()
      .regex(indianPhone, "Enter a valid Indian mobile number")
      .optional(),
  }),
  company: z.object({
    legalName: z.string().trim().min(2).max(200),
    displayName: z.string().trim().min(2).max(160),
    companyType: z.enum(companyTypes),
    registrationNumber: z.string().trim().min(3).max(50).optional(),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(gstin, "Enter a valid GSTIN")
      .optional(),
  }),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(72),
});
