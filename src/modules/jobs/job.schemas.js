import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Company ID must be a MongoDB ObjectId");

export const companyJobParamsSchema = z.object({
  companyId: objectIdSchema,
});

export const assessmentParamsSchema = z.object({
  token: z.string().uuid("Assessment token must be a UUID"),
});

const skillThresholdSchema = z
  .object({
    skill: z.string().trim().min(1).max(80),
    minimumLevel: z.number().int().min(1).max(100),
  })
  .strict();

export const createJobSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(10000),
    location: z.string().trim().min(2).max(120),
    employmentType: z.enum([
      "FULL_TIME",
      "PART_TIME",
      "CONTRACT",
      "INTERNSHIP",
    ]),
    workplaceType: z.enum(["ONSITE", "HYBRID", "REMOTE"]),
    skillThresholds: z.array(skillThresholdSchema).min(1).max(20),
  })
  .strict()
  .superRefine((job, context) => {
    const seenSkills = new Set();

    job.skillThresholds.forEach((threshold, index) => {
      const skillKey = threshold.skill.toLocaleLowerCase("en-IN");
      if (seenSkills.has(skillKey)) {
        context.addIssue({
          code: "custom",
          path: ["skillThresholds", index, "skill"],
          message: "Each skill may only have one threshold",
        });
      }
      seenSkills.add(skillKey);
    });
  });
