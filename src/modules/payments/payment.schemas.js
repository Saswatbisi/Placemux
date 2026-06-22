import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a MongoDB ObjectId");

const candidateSkillSchema = z
  .object({
    skill: z.string().trim().min(1).max(80),
    level: z.number().int().min(1).max(100),
  })
  .strict();

export const checkoutSchema = z
  .object({
    jobId: objectIdSchema,
    skills: z.array(candidateSkillSchema).min(1).max(20),
  })
  .strict()
  .superRefine((data, context) => {
    const seenSkills = new Set();
    data.skills.forEach((item, index) => {
      const skillKey = item.skill.toLocaleLowerCase("en-IN");
      if (seenSkills.has(skillKey)) {
        context.addIssue({
          code: "custom",
          path: ["skills", index, "skill"],
          message: "Each skill may only have one level specified",
        });
      }
      seenSkills.add(skillKey);
    });
  });

export const verifyPaymentSchema = z
  .object({
    gatewayOrderId: z.string().trim().min(1),
    gatewayPaymentId: z.string().trim().min(1),
    gatewaySignature: z.string().trim().min(1),
  })
  .strict();
