import { parseRequestSchema } from "./parser.schemas.js";
import { ParserService } from "./parser.service.js";

export function parserRoutes(db) {
  return async (app) => {
    const service = new ParserService();

    app.addHook("onRequest", app.authenticate);

    // POST /api/v1/parser/resume
    app.post("/resume", async (request, reply) => {
      const { text } = parseRequestSchema.parse(request.body);
      const result = service.parseResume(text);

      if (db && db.user && request.user?.userId) {
        const formattedSkills = result.map((s) => ({
          skill: s.skill,
          skillKey: s.skill.toLocaleLowerCase("en-IN"),
          level: s.level,
        }));

        await db.user.update({
          where: { id: request.user.userId },
          data: {
            resumeText: text,
            skillsJson: JSON.stringify(formattedSkills),
          },
        });
      }

      return reply.code(200).send({ data: result });
    });

    // POST /api/v1/parser/jd
    app.post("/jd", async (request, reply) => {
      const { text } = parseRequestSchema.parse(request.body);
      const result = service.parseJd(text);
      return reply.code(200).send({ data: result });
    });
  };
}
