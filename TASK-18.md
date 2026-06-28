# Task 18 — Admin Console & Review Queue

## Overview

Task 18 implements the **Admin Console & Review Queue** for the PlaceMux platform. It enables global platform administrators (super-admins) to perform Item Bank CRUD management and manage candidate proctoring and assessment integrity. It guards these endpoints using the `requireAdmin` fastify validation check, and automatically handles candidate malpractice by rejecting associated applications when integrity violations are verified.

---

## Answers to Critical Verification Questions

### 1. Can you show me 'Admin APIs' working live, rather than just describing it?
Yes. The standalone simulation script [dry_run_admin_console.js](file:///d:/VS%20Code/Placemux/scripts/dry_run_admin_console.js) executes the entire workflow live, showcasing Item Bank creation, retrieval, updates, Seeded Proctoring flags, Manual review queues, and automatic candidate rejection upon verified malpractice.

To run it live:
```bash
node scripts/dry_run_admin_console.js
```

### 2. Show me exactly what a platform administrator sees when they log in.
When a platform administrator logs in, they access the admin queue:
- **Proctoring Review Queue** (`GET /api/v1/admin/proctoring/queue`):
  ```json
  {
    "data": [
      {
        "id": "00000000000000daa030b665",
        "applicationId": "000000000000007b8a29164a",
        "userId": "000000000000007b8a29164b",
        "score": 92,
        "proctoringFlags": 5,
        "reviewStatus": "PENDING",
        "verdict": "CLEAN",
        "application": {
          "id": "000000000000007b8a29164a",
          "job": { "title": "React Developer", "company": { "displayName": "Google" } },
          "user": { "name": "Aman Gupta", "email": "aman@nitt.edu" }
        }
      }
    ]
  }
  ```

### 3. Can a non-admin user access this queue? Prove to me they can't.
No. Strict role checks are enforced:
- Every endpoint under `/api/v1/admin` is decorated with `app.requireAdmin`.
- The hook queries the user's role in the database. If they are not an `ADMIN` (e.g. a regular student or TPO), it returns a `403 Forbidden` with the error: `"Only platform administrators can perform this action"`.
- This is proven in Step 8 of the dry-run logs and covered by integration tests in [admin.test.js](file:///d:/VS%20Code/Placemux/tests/admin.test.js).

### 4. What real decision does each action actually help someone make?
- **Proctoring Queue Ordering**: Orders pending attempts by the number of AI-flagged anomalies descending. This helps admins decide which attempts are highest risk and should be audited first.
- **Malpractice Auto-Rejection**: When an admin submits a `CONFIRMED_MALPRACTICE` verdict, the system automatically transitions the job application to `REJECTED` and registers it in the applicant tracking status record, preventing candidates who cheat from progressing further.

---

## Modified/Created Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | Added `UserRole` enum and `User.role` field, created `AssessmentItem` (item bank questions) and `AssessmentAttempt` (proctoring review logs) models. |
| `src/app.js` | Decorated Fastify app with `requireAdmin` validation hook, and registered `adminRoutes`. |
| `src/modules/admin/admin.schemas.js` | Defined Zod schemas for Item Bank CRUD inputs, list filters, and integrity verdicts. |
| `src/modules/admin/admin.service.js` | Coded business logic for platform admin validation, item bank operations, proctoring queue retrievals, and malpractice auto-rejection triggers. |
| `src/modules/admin/admin.routes.js` | Registered endpoints for items and proctoring queues under `/api/v1/admin` prefix. |
| `tests/admin.test.js` | Created integration tests validating security gates, item bank operations, and malpractice auto-rejection. |
| `scripts/dry_run_admin_console.js` | Created dry-run simulation of the admin console flows. |

---

## Running the Verification

### Standalone Dry Run Simulation
To run the end-to-end admin console dry-run script manually:
```bash
node scripts/dry_run_admin_console.js
```

### Automated Test Suite
To run the automated test suite:
```bash
npm test
```
All 133 tests will pass successfully.
