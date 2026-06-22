import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .url()
    .startsWith("mongodb", "DATABASE_URL must be a MongoDB connection string")
    .default("mongodb://127.0.0.1:27017/placemux"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must contain at least 32 characters")
    .default("development-only-secret-change-me-now"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  RAZORPAY_KEY_ID: z.string().optional().default("rzp_test_fakeKeyId123"),
  RAZORPAY_KEY_SECRET: z.string().optional().default("fakeSecretKey1234567890"),
});

export const config = configSchema.parse(process.env);
