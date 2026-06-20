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

export const applyToJobSchema = z
  .object({
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

export const updateApplicationStatusSchema = z
  .object({
    status: z.enum(["PENDING", "SHORTLISTED", "REJECTED"]),
  })
  .strict();

export const jobIdParamsSchema = z.object({
  jobId: objectIdSchema,
}).strict();

export const companyApplicationParamsSchema = z.object({
  companyId: objectIdSchema,
  applicationId: objectIdSchema,
}).strict();

export const companyJobParamsSchema = z.object({
  companyId: objectIdSchema,
  jobId: objectIdSchema,
}).strict();

export const applicationIdParamsSchema = z.object({
  id: objectIdSchema,
}).strict();
