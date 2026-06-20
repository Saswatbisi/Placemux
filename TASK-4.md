# Task 4 — Applications & Shortlisting

## Overview

Exposes endpoints that allow candidates (students) to apply to published jobs with their self-assessed skill levels, and enables company owners or admins to view applications and shortlist candidates.

---

## New Files

| File | Purpose |
|------|---------|
| `src/modules/applications/application.schemas.js` | Zod validation schemas for job applications and status updates |
| `src/modules/applications/application.service.js` | Business logic for validating requirements, processing applications, and managing status |
| `src/modules/applications/application.routes.js`  | Fastify route definitions for application and shortlisting endpoints |
| `tests/application.validation.test.js`      | Unit tests for application query and body schemas |
| `tests/application.test.js`                 | Integration tests for application and shortlisting endpoints |

## Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `ApplicationStatus` enum, `Application`, and `CandidateSkill` models |
| `src/app.js` | Registered `applicationRoutes` under `/api/v1` prefix |
| `src/modules/search/search.schemas.js` | Added `.strict()` to `searchJobsQuerySchema` |
| `src/modules/search/search.routes.js` | Removed unused arguments to resolve linting errors |

---

## API Endpoints

All endpoints require authentication unless specified otherwise.

### 📝 Student Applications

#### `POST /api/v1/jobs/:jobId/applications`
Allows a student to apply for a published job.

**Request Body:**
```json
{
  "skills": [
    {
      "skill": "React",
      "level": 80
    }
  ]
}
```

- **Validation:**
  - `skills` must be an array of objects containing `skill` (1-80 characters) and `level` (integer between 1 and 100).
  - The application must contain candidate skill levels for **all** the required skills defined in the job's skill thresholds (case-insensitive match).
  - Duplicate skill names are rejected.
  - The student cannot apply to the same job twice (results in `409 Conflict`).
  - The job must be `PUBLISHED` (returns `404 Not Found` if the job is closed or missing).

**Response:**
```json
{
  "data": {
    "id": "685400000000000000000004",
    "jobId": "685400000000000000000003",
    "userId": "685400000000000000000001",
    "status": "PENDING",
    "createdAt": "2026-06-20T17:00:00.000Z",
    "updatedAt": "2026-06-20T17:00:00.000Z",
    "candidateSkills": [
      {
        "id": "candidate-skill-1",
        "skill": "React",
        "level": 80
      }
    ],
    "job": {
      "id": "685400000000000000000003",
      "title": "React Developer",
      "companyId": "685400000000000000000002",
      "company": {
        "id": "685400000000000000000002",
        "displayName": "Acme Corp"
      }
    },
    "user": {
      "id": "685400000000000000000001",
      "name": "Aarav Sharma",
      "email": "aarav@example.com"
    }
  }
}
```

---

#### `GET /api/v1/applications`
Retrieve the authenticated candidate's own job applications.

**Response:** `{ "data": [ ...applications ] }`

---

#### `GET /api/v1/applications/:id`
Retrieve application details for a specific application ID. Accessible by the applicant, or any member of the company that posted the job.

---

### 💼 Company Shortlisting

#### `GET /api/v1/companies/:companyId/applications`
Retrieve all applications submitted to jobs posted by the company. Accessible by any member of the company.

---

#### `GET /api/v1/companies/:companyId/jobs/:jobId/applications`
Retrieve applications submitted to a specific job posted by the company. Accessible by any member of the company.

---

#### `PATCH /api/v1/companies/:companyId/applications/:applicationId`
Update the status of a job application (e.g. shortlisting or rejecting a candidate).

- **Authorization:** Only users with `OWNER` or `ADMIN` roles for the company are authorized to update status. Regular `MEMBER` users will receive `403 Forbidden`. Non-members will receive `404 Company not found` to prevent enumeration.

**Request Body:**
```json
{
  "status": "SHORTLISTED"
}
```
*Note: valid status values are `PENDING`, `SHORTLISTED`, or `REJECTED`.*

**Response:** `{ "data": { ...updatedApplication } }`

---

## Running Tests

```bash
npm test
```

Tests cover:
- Zod schema rules (strict validation, array limits, integer bounds, unique skills check).
- Successful application flow with database schema verification.
- Prevent duplicate applications (`409 Conflict`).
- Required job skill threshold fulfillment validation.
- Shortlist & Reject application logic for `OWNER` and `ADMIN`.
- Authorization checks for non-members and standard company `MEMBER`s.
