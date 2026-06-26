# Task 13 — Verification & Interview Scheduling

## Overview

Exposes a public verification endpoint for signed offers allowing open authenticity validation, and implements a comprehensive interview scheduling module supporting interview creation, retrieval, and rescheduling. Relational integrity, company-suspended validations, input constraints, and membership role-based permissions are enforced throughout.

---

## Answers to Critical Verification Questions

### 1. Can signed offers be verified publicly by third parties?

Yes, the backend route `GET /api/v1/offers/:id/verify` has been decoupled from global JWT authentication checks. Anyone (with or without a logged-in user account) can query this endpoint to re-verify the signature hash and detect whether database terms have been altered, ensuring tamper-evident proof of authenticity.

### 2. Who is permitted to schedule and manage candidate interviews?

- **Scheduling/Rescheduling/Cancellation**: Only users who are active company members (`OWNER`, `ADMIN`, or `MEMBER`) can schedule or modify interviews for an application associated with their company.
- **Retrieval**: Both the candidates (applicants) and the company members can retrieve the list of scheduled interviews. Other users are blocked and receive a `404 Not Found` response.

---

## Modified/Created Files

| File                                          | Change                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                        | Added `InterviewStatus` enum, `Interview` model, and linked `Interview` to `Application` via a one-to-many relationship.                                                                 |
| `src/app.js`                                  | Imported and registered `interviewRoutes` under the `/api/v1` prefix.                                                                                                                    |
| `src/modules/offers/offer.routes.js`          | Removed global JWT authorization hook and applied it on a per-route basis to keep the verification endpoint public.                                                                      |
| `src/modules/interviews/interview.schemas.js` | Created Zod schemas for validating interview creation payload, update payload, and path parameters.                                                                                      |
| `src/modules/interviews/interview.service.js` | Implemented business logic for scheduling interviews, listing application interviews, fetching a specific interview, and updating/rescheduling interviews.                               |
| `src/modules/interviews/interview.routes.js`  | Configured routes and route options with validation schemas.                                                                                                                             |
| `tests/offer.test.js`                         | Added integration tests verifying that offer verification is accessible without `Authorization` header.                                                                                  |
| `tests/interview.test.js`                     | Created 11 integration test cases testing happy path creation, candidate list fetching, role-based boundary block checks, suspended company blocks, input validations, and rescheduling. |

---

## API Endpoints

### 🔍 1. Public Verify Offer Signature

#### `GET /api/v1/offers/:id/verify`

Retrieves authenticity and tamper-evidence details of a signed offer.

- **Authorization**: Public (No JWT required)

---

### 📅 2. Schedule Application Interview

#### `POST /api/v1/companies/:companyId/applications/:applicationId/interviews`

Schedules a new interview round for an application.

- **Authorization**: Authenticated company member (`OWNER`, `ADMIN`, `MEMBER`)
- **Request Body**:

```json
{
  "title": "Technical Interview Round 1",
  "scheduledAt": "2026-07-01T10:00:00.000Z",
  "duration": 45,
  "meetingLink": "https://meet.google.com/abc-xyz-123",
  "interviewerName": "Sohan Lal"
}
```

---

### 📂 3. List Application Interviews

#### `GET /api/v1/applications/:applicationId/interviews`

Retrieves all interviews scheduled for the application.

- **Authorization**: Candidate (owner of application) OR company member

---

### 🔍 4. Fetch Interview Details

#### `GET /api/v1/interviews/:id`

Retrieves details of a specific interview.

- **Authorization**: Candidate OR company member

---

### 📝 5. Update/Reschedule Interview

#### `PATCH /api/v1/interviews/:id`

Updates interview parameters or cancels the scheduled round.

- **Authorization**: Company member (`OWNER`, `ADMIN`, `MEMBER`)
- **Request Body**:

```json
{
  "scheduledAt": "2026-07-02T11:00:00.000Z",
  "status": "COMPLETED"
}
```

---

## Running Tests

To run the complete test suite:

```bash
npm run test
```

All 107 test cases will pass successfully.
