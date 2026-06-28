import {
  attemptIdParamsSchema,
  createAssessmentItemSchema,
  getAssessmentItemsQuerySchema,
  itemIdParamsSchema,
  submitIntegrityVerdictSchema,
  updateAssessmentItemSchema,
} from "./admin.schemas.js";
import { AdminService } from "./admin.service.js";

export function adminRoutes(db) {
  return async (app) => {
    const service = new AdminService(db);

    // Apply authentication and admin authorization hooks to all endpoints in this router
    app.addHook("onRequest", app.authenticate);
    app.addHook("onRequest", app.requireAdmin);

    // ──────────────────────────────
    //  Item Bank Endpoints
    // ──────────────────────────────

    // POST /api/v1/admin/items
    app.post("/items", async (request, reply) => {
      const input = createAssessmentItemSchema.parse(request.body);
      const result = await service.createAssessmentItem(request.user.userId, input);
      return reply.code(201).send({ data: result });
    });

    // GET /api/v1/admin/items
    app.get("/items", async (request) => {
      const query = getAssessmentItemsQuerySchema.parse(request.query);
      const result = await service.getAssessmentItems(request.user.userId, query);
      return { data: result };
    });

    // PUT /api/v1/admin/items/:itemId
    app.put("/items/:itemId", async (request) => {
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const input = updateAssessmentItemSchema.parse(request.body);
      const result = await service.updateAssessmentItem(request.user.userId, itemId, input);
      return { data: result };
    });

    // DELETE /api/v1/admin/items/:itemId
    app.delete("/items/:itemId", async (request) => {
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const result = await service.deleteAssessmentItem(request.user.userId, itemId);
      return { data: result };
    });

    // ──────────────────────────────
    //  Proctoring Review Queue
    // ──────────────────────────────

    // GET /api/v1/admin/proctoring/queue
    app.get("/proctoring/queue", async (request) => {
      const result = await service.getProctoringQueue(request.user.userId);
      return { data: result };
    });

    // POST /api/v1/admin/proctoring/:attemptId/verdict
    app.post("/proctoring/:attemptId/verdict", async (request) => {
      const { attemptId } = attemptIdParamsSchema.parse(request.params);
      const input = submitIntegrityVerdictSchema.parse(request.body);
      const result = await service.submitIntegrityVerdict(request.user.userId, attemptId, input);
      return { data: result };
    });
  };
}
