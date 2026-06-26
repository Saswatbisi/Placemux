# Task 13 — Verification & Interview Scheduling Demo Script

This script is structured to help you present and execute the demo of **Task 13: Verification & Interview Scheduling** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction

> "Hi everyone. Today, I'm presenting the implementation of **Task 13: Verification & Interview Scheduling**.
> A complete onboarding experience requires both candidate-facing trust and seamless coordination. In this task, we make signed contracts verifiable publicly by external audit systems and introduce a robust interview scheduling and rescheduling pipeline."

### 2. Key Architecture Features

> "We've implemented two major capabilities in this update:
>
> 1. **Public Offer Verification**: We decoupled the `/api/v1/offers/:id/verify` endpoint from global JWT authentication checks. Now, anyone—such as third-party verifying services or candidates without an active session—can verify the authenticity of a signed job offer and prove it has not been tampered with in the database.
> 2. **Interview Scheduling workflow**: We created a complete relational module for scheduling:
>    - **Creation**: Active company members (Owners, Admins, and Members) can schedule interview rounds on job applications, specifying scheduled times, durations, interviewer names, and meeting links.
>    - **Rescheduling & Status Updates**: Company members can reschedule or cancel interviews, updating the status flags dynamically.
>    - **Retrieval boundaries**: Candidates can retrieve and view details for interviews scheduled for their own applications, while company members can access interviews for their corporate openings. Other unauthorized users are strictly blocked."

### 3. Execution Verification

> "Let's run the test suites. We have added a dedicated integration test suite for interviews and updated the offers test suite to confirm public access. All tests run and pass successfully."

---

## 🚀 Execution & Demo Flow

### Step 1: Run the Updated Tests

Verify test execution via vitest:

```bash
npx vitest run tests/offer.test.js tests/interview.test.js
```

_Expected Output: All 11 offer tests and 11 interview tests pass successfully._

### Step 2: Code Walkthrough

Show the following files during the walkthrough:

1. **[schema.prisma](file:///d:/VS%20Code/Placemux/prisma/schema.prisma#L308)**: Show the `Interview` model, its enums (`SCHEDULED`, `COMPLETED`, `CANCELLED`), and the one-to-many relationship with `Application`.
2. **[offer.routes.js](file:///d:/VS%20Code/Placemux/src/modules/offers/offer.routes.js#L13)**: Point out how `{ onRequest: app.authenticate }` is now defined per-route, keeping `GET /offers/:id/verify` publicly accessible.
3. **[interview.service.js](file:///d:/VS%20Code/Placemux/src/modules/interviews/interview.service.js#L39)**: Show permissions checking for `scheduleInterview` (enforcing company membership roles) and get/update access control limits.
4. **[interview.test.js](file:///d:/VS%20Code/Placemux/tests/interview.test.js#L77)**: Walk through the test cases verifying happy path scheduling, input constraints (such as future date checking), candidate views, and blocked unauthorized actors.

---

## 🏁 Conclusion

> "With Task 13 complete, our offer validation trust layer is fully public-verifiable, and our interview scheduling system is live and secure."
