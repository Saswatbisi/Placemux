import {
  collegeSignupSchema,
  addMemberSchema,
  addStudentSchema,
  joinCollegeSchema,
  collegeIdParamsSchema,
} from "./college.schemas.js";
import { CollegeService } from "./college.service.js";

export function collegeRoutes(db) {
  return async (app) => {
    const service = new CollegeService(db);

    // POST /api/v1/colleges/signup
    app.post("/signup", async (request, reply) => {
      const input = collegeSignupSchema.parse(request.body);
      const result = await service.signupCollege(input);
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

    // Encapsulate all authenticated routes to apply onRequest hook only to them
    await app.register(async (authApp) => {
      authApp.addHook("onRequest", app.authenticate);

      // POST /api/v1/colleges/join
      authApp.post("/join", async (request) => {
        const input = joinCollegeSchema.parse(request.body);
        const user = await service.joinCollege(request.user.userId, input);
        return { data: user };
      });

      // GET /api/v1/colleges/:id
      authApp.get("/:id", async (request) => {
        const { id } = collegeIdParamsSchema.parse(request.params);
        const college = await service.getCollege(id, request.user.userId);
        return { data: college };
      });

      // POST /api/v1/colleges/:id/members
      authApp.post("/:id/members", async (request, reply) => {
        const { id } = collegeIdParamsSchema.parse(request.params);
        const input = addMemberSchema.parse(request.body);
        const membership = await service.addMember(id, request.user.userId, input);
        return reply.code(201).send({ data: membership });
      });

      // GET /api/v1/colleges/:id/members
      authApp.get("/:id/members", async (request) => {
        const { id } = collegeIdParamsSchema.parse(request.params);
        const members = await service.getMembers(id, request.user.userId);
        return { data: members };
      });

      // POST /api/v1/colleges/:id/students
      authApp.post("/:id/students", async (request) => {
        const { id } = collegeIdParamsSchema.parse(request.params);
        const input = addStudentSchema.parse(request.body);
        const student = await service.addStudentByEmail(id, request.user.userId, input);
        return { data: student };
      });

      // GET /api/v1/colleges/:id/students
      authApp.get("/:id/students", async (request) => {
        const { id } = collegeIdParamsSchema.parse(request.params);
        const students = await service.getStudents(id, request.user.userId);
        return { data: students };
      });

      // GET /api/v1/colleges/:id/dashboard
      authApp.get("/:id/dashboard", async (request) => {
        const { id } = collegeIdParamsSchema.parse(request.params);
        const dashboard = await service.getCollegeDashboard(id, request.user.userId);
        return { data: dashboard };
      });
    });
  };
}
