# Task 5 — Marketplace Integration & Company Portal v1

## Overview

Stabilizes the marketplace APIs by introducing validation checks, enforcing business-critical constraints, optimizing database queries for high-volume search, and ensuring the end-to-end flow is completely secure and resilient.

---

## New Files

| File                           | Purpose                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `tests/company.status.test.js` | Integration tests verifying company status constraints (suspensions) across job posting, profile updates, and applications |

## Modified Files

| File                                              | Change                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                            | Added database indexes to `Job` collection to optimize status-based filtering, location, employment type, and workplace type lookups. |
| `src/modules/applications/application.service.js` | Enforced skill thresholds during application creation and blocked applying or updating applications belonging to suspended companies. |
| `src/modules/companies/company.service.js`        | Added suspended company verification in company membership checks.                                                                    |
| `src/modules/jobs/job.service.js`                 | Restricted job publishing if the posting company is suspended.                                                                        |
| `src/modules/search/search.service.js`            | Updated search, job lookup, discovery, and skill/location/employment facets queries to filter out jobs from suspended companies.      |
| `tests/application.test.js`                       | Added integration tests verifying application rejection when candidate skill levels are below job thresholds.                         |

---

## Key Technical Integration Fixes

### 1. Enforced Skill Thresholds

- **Validation Rules**: Candidates can only apply for a job if their self-assessed skill levels meet or exceed the job's minimum required levels (as defined by `minimumLevel` on `JobSkillThreshold`).
- **Error Handling**: If a student's self-assessed level is less than the threshold for any required skill, the request is rejected with `400 VALIDATION_ERROR` detailing the below-threshold skills.

### 2. Company State Controls & Suspensions

- **Access Control**: Active company owners and admins are verified via membership checks, but if their company status is changed to `SUSPENDED`, all state-changing operations are blocked:
  - Posting a job (`POST /api/v1/companies/:companyId/jobs`) -> `403 Forbidden`
  - Updating company profile (`PATCH /api/v1/companies/:companyId/profile`) -> `403 Forbidden`
  - Managing application status (`PATCH /api/v1/companies/:companyId/applications/:applicationId`) -> `403 Forbidden`
- **Public Visibility & Applies**:
  - If a company is suspended, all its jobs are immediately filtered out from public job search, discovery, and facets aggregation.
  - Job seekers attempting to apply directly to a suspended company's job will be blocked with `403 Forbidden`.

### 3. Database Search Performance Optimization

To ensure fast page load times and indexing efficiency under load, the following MongoDB indexes have been defined:

- `@@index([status, createdAt])` — Accelerates public job listing sorted by recency (e.g. `GET /api/v1/search/jobs` or `GET /api/v1/discover/recent`).
- `@@index([location])` — Optimizes geo-filtering (e.g. `GET /api/v1/discover/locations`).
- `@@index([employmentType])` / `@@index([workplaceType])` — Speeds up filtered query aggregation.

---

## Integration Demo Flow (Step-by-Step)

Below is the verification flow showing how a developer can demo the end-to-end integration:

### Step 1: Onboard a New Company

Sign up a new company (status defaults to `DRAFT` and the owner membership is created atomically):

```bash
curl -X POST http://localhost:3000/api/v1/auth/companies/signup \
  -H "Content-Type: application/json" \
  -d '{
    "owner": {
      "name": "Saswat Bisi",
      "email": "saswat@example.com",
      "password": "SecurePassword123",
      "phone": "+919876543210"
    },
    "company": {
      "legalName": "Placemux Technologies Pvt Ltd",
      "displayName": "Placemux",
      "companyType": "PRIVATE_LIMITED",
      "registrationNumber": "U12345OR2026PTC123456",
      "gstin": "21AAAAA1111A1Z1"
    }
  }'
```

_Extract the `accessToken` and `company.id` from response._

### Step 2: Publish a Job with Skill Thresholds

```bash
curl -X POST http://localhost:3000/api/v1/companies/COMPANY_ID/jobs \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior NodeJS Engineer",
    "description": "Design and build high-performance APIs with Fastify.",
    "location": "Bhubaneswar",
    "employmentType": "FULL_TIME",
    "workplaceType": "REMOTE",
    "skillThresholds": [
      { "skill": "NodeJS", "minimumLevel": 70 },
      { "skill": "MongoDB", "minimumLevel": 60 }
    ]
  }'
```

_Extract the job `id` and `assessmentUrl`._

### Step 3: Student Applies (Successful and Unsuccessful Paths)

Login or register a student, then submit an application:

**Failed Path (Below threshold level 50 for NodeJS):**

```bash
curl -X POST http://localhost:3000/api/v1/jobs/JOB_ID/applications \
  -H "Authorization: Bearer STUDENT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": [
      { "skill": "NodeJS", "level": 50 },
      { "skill": "MongoDB", "level": 80 }
    ]
  }'
```

_Response: 400 VALIDATION_ERROR (Skill level below minimum)._

**Successful Path (Meets or exceeds NodeJS 70 and MongoDB 60):**

```bash
curl -X POST http://localhost:3000/api/v1/jobs/JOB_ID/applications \
  -H "Authorization: Bearer STUDENT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": [
      { "skill": "NodeJS", "level": 80 },
      { "skill": "MongoDB", "level": 75 }
    ]
  }'
```

_Response: 201 Created._

### Step 4: Company Shortlists Candidate

```bash
curl -X PATCH http://localhost:3000/api/v1/companies/COMPANY_ID/applications/APPLICATION_ID \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "SHORTLISTED"
  }'
```

_Response: 200 OK (Status updated to SHORTLISTED)._

---

## Running Tests

To verify that the integration fixes do not cause regressions and all constraints are strictly checked, execute:

```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```

All 59 automated test cases covering:

- Skill threshold validations (missing, duplicate, out-of-bounds, below-minimum levels).
- Company onboarding, membership permissions, profile updates.
- Company suspension blocks on job postings, profile updates, and applications.
- Public search index filters and relevance-based ranking.
  will run sequentially and pass successfully.
