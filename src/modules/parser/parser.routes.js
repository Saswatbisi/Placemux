import { parseRequestSchema } from "./parser.schemas.js";
import { ParserService } from "./parser.service.js";

export function parserRoutes() {
  return async (app) => {
    const service = new ParserService();

    app.addHook("onRequest", app.authenticate);

    // POST /api/v1/parser/resume
    app.post("/resume", async (request, reply) => {
      const { text } = parseRequestSchema.parse(request.body);
      const result = service.parseResume(text);
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
