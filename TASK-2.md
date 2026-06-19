# Task 2: Job Posting with Skill Thresholds

## Phase

**Week 2 - Phase 2**

## Objective

Allow companies to publish jobs that require candidates to meet defined skill
levels from **L1 to L100**.

## Founder Demo Goal

A company owner or admin can:

1. Publish a job with one or more skill thresholds.
2. Set each required skill to an integer level between L1 and L100.
3. Receive a unique assessment link for the published job.
4. Open the assessment link and view the job's required skill thresholds.

## API Contract

### Publish a Job

```http
POST /api/v1/companies/:companyId/jobs
Authorization: Bearer <access-token>
Content-Type: application/json
```

Only users with the `OWNER` or `ADMIN` role for the company may publish jobs.

Example request:

```json
{
  "title": "Backend Engineer",
  "description": "Build and maintain reliable marketplace APIs using Node.js.",
  "location": "Bengaluru, Karnataka",
  "employmentType": "FULL_TIME",
  "workplaceType": "HYBRID",
  "skillThresholds": [
    {
      "skill": "Node.js",
      "minimumLevel": 70
    },
    {
      "skill": "PostgreSQL",
      "minimumLevel": 55
    }
  ]
}
```

Successful response:

```http
201 Created
```

```json
{
  "data": {
    "id": "685400000000000000000001",
    "companyId": "685400000000000000000000",
    "title": "Backend Engineer",
    "description": "Build and maintain reliable marketplace APIs using Node.js.",
    "location": "Bengaluru, Karnataka",
    "employmentType": "FULL_TIME",
    "workplaceType": "HYBRID",
    "status": "PUBLISHED",
    "assessmentToken": "b2e8a824-d68f-4693-b5b5-49ac822ac020",
    "assessmentUrl": "http://localhost:3000/api/v1/assessments/b2e8a824-d68f-4693-b5b5-49ac822ac020",
    "skillThresholds": [
      {
        "id": "685400000000000000000002",
        "skill": "Node.js",
        "minimumLevel": 70
      },
      {
        "id": "685400000000000000000003",
        "skill": "PostgreSQL",
        "minimumLevel": 55
      }
    ]
  }
}
```

### Resolve an Assessment Link

```http
GET /api/v1/assessments/:token
```

This route is public so a candidate can open the generated link. It returns the
published job, company name, and required skill thresholds. It does not expose
the private assessment token or company membership data.

## Validation Rules

| Field | Rule |
| --- | --- |
| `title` | 3-120 characters |
| `description` | 20-10,000 characters |
| `location` | 2-120 characters |
| `employmentType` | `FULL_TIME`, `PART_TIME`, `CONTRACT`, or `INTERNSHIP` |
| `workplaceType` | `ONSITE`, `HYBRID`, or `REMOTE` |
| `skillThresholds` | 1-20 skills per job |
| `skill` | 1-80 characters |
| `minimumLevel` | Integer from 1 through 100 |

Skill names must be unique within a job. Duplicate names are rejected
case-insensitively, so `Node.js` and `node.js` cannot both be submitted.

Unknown request fields are rejected.

## Authorization and Failure Handling

- A valid JWT is required to publish a job.
- Non-members receive `404 Company not found` to prevent company enumeration.
- Company members without the `OWNER` or `ADMIN` role receive `403 Forbidden`.
- Invalid job data receives `400 VALIDATION_ERROR`.
- Invalid or closed assessment links receive `404 Assessment not found`.
- The job and its skill thresholds are created together through one nested
  database operation.

## Data Model

### Job

- Company reference
- Title and description
- Location
- Employment type
- Workplace type
- Publication status
- Unique assessment token
- Created and updated timestamps

### JobSkillThreshold

- Job reference
- Display skill name
- Normalized skill key
- Minimum level from 1 to 100

The normalized skill key supports case-insensitive uniqueness per job.

## Configuration

Assessment links use the following environment variable:

```env
API_PUBLIC_URL=http://localhost:3000
```

Production must set this value to the public API origin.

## Verification Checklist

- [ ] Prisma client generates successfully.
- [ ] Database schema is synchronized.
- [ ] Owner can publish a job.
- [ ] Admin can publish a job.
- [ ] Member cannot publish a job.
- [ ] L1 and L100 thresholds are accepted.
- [ ] L0 and L101 thresholds are rejected.
- [ ] Decimal skill levels are rejected.
- [ ] Duplicate skill names are rejected.
- [ ] A unique assessment link is returned.
- [ ] The assessment link resolves to the published job.
- [ ] Automated tests, lint, and build pass.

## Local Commands

```bash
npm run prisma:generate
npm run db:push
npm run build
npm test
npm run lint
```

## Definition of Done

Task 2 is complete when a company owner or admin can publish a job containing
valid L1-L100 skill thresholds and receive a working per-job assessment link.
