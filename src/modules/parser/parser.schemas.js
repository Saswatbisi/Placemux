import { z } from "zod";

export const parseRequestSchema = z
  .object({
    text: z
      .string({
        required_error: "Text content is required",
        invalid_type_error: "Text must be a string",
      })
      .trim()
      .min(1, "Text content cannot be empty")
      .max(50000, "Text content cannot exceed 50000 characters"),
  })
  .strict();
