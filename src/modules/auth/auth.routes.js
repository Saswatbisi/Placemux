import { companySignupSchema, loginSchema } from "./auth.schemas.js";
import { AuthService } from "./auth.service.js";

export function authRoutes(db) {
  return async (app) => {
    const service = new AuthService(db);

    app.post("/companies/signup", async (request, reply) => {
      const input = companySignupSchema.parse(request.body);
      const result = await service.signupCompany(input);
      const accessToken = await reply.jwtSign({
        userId: result.user.id,
        email: result.user.email,
      });

      return reply.code(201).send({
        data: {
          ...result,
          accessToken,
        },
      });
    });

    app.post("/login", async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const user = await service.login(input);
      const accessToken = await reply.jwtSign({
        userId: user.id,
        email: user.email,
      });

      return {
        data: {
          user,
          accessToken,
        },
      };
    });
  };
}
