# Task 14 — End-to-End Status Tracking & Parsing Demo Script

This script is structured to help you present and execute the demo of **Task 14: End-to-End Status Tracking & Parsing** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction

> "Hi everyone. Today, I'm presenting the implementation of **Task 14: End-to-End Status Tracking & Parsing**.
> A major challenge in recruitment platforms is keeping candidates and employers synchronized on application progress, and automating candidate skill ingestion from resumes. In this task, we've unified the application-to-offer status pipeline and built an intelligent, proximity-aware resume and job description parser."

### 2. Key Architecture Features

> "We've implemented two major capabilities in this update:
>
> 1. **Unified Application Status Tracking**:
>    - We designed and integrated the new `ApplicationStatusRecord` database model.
>    - Unified states map directly to the application lifecycle: `APPLIED` when submitted, `SHORTLISTED` when short-listed, `INTERVIEWING` when interviews are scheduled, `OFFER_GENERATED` when company issues an offer, and `OFFER_ACCEPTED` once signed by the applicant.
>    - Exposed this live tracker via a new secure API route: `GET /api/v1/applications/:id/status`.
>
> 2. **Resume & Job Description Parsing**:
>    - Built a robust, regex-based skill extraction engine under the `/api/v1/parser` namespace.
>    - Uses **Sentence-Boundary Constraints** to make sure skill levels are only extracted from context in the same sentence.
>    - Uses **Proximity Ranking** to find the closest level match when multiple numbers are near a keyword.
>    - Uses **Filter Heuristics** to dynamically ignore noise numbers such as years or months of experience (e.g. '3 years of experience' won't be parsed as level 3)."

### 3. Execution Verification

> "Let's run the full test suite. We have added new integration test suites for status tracking and parser validation. All tests run and pass successfully."

---

## 🚀 Execution & Demo Flow

### Step 1: Run the Updated Tests

Verify test execution via vitest:

```bash
npx vitest run tests/status.test.js tests/parser.test.js
```

_Expected Output: All 6 status tracking tests and 4 parser tests pass successfully._

To run the complete test suite:

```bash
npm test
```

_Expected Output: All 117 tests pass successfully._

### Step 2: Code Walkthrough

Show the following files during the walkthrough:

1. **[schema.prisma](file:///d:/VS%20Code/Placemux/prisma/schema.prisma#L330)**: Show the `ApplicationStatusRecord` model and its one-to-one mapping to the `Application` model.
2. **[application.service.js](file:///d:/VS%20Code/Placemux/src/modules/applications/application.service.js#L292)**: Point out how `getApplicationStatus` resolves status, handles self-healing for missing records, and how transitions occur inside transaction blocks during job applying and status updates.
3. **[parser.service.js](file:///d:/VS%20Code/Placemux/src/modules/parser/parser.service.js#L28)**: Walk through the parser's logic, including sentence-boundary extraction, years-of-experience regex exclusion, and proximity sorting.
4. **[parser.routes.js](file:///d:/VS%20Code/Placemux/src/modules/parser/parser.routes.js#L4)**: Show the Zod-validated endpoints for `/resume` and `/jd` that interface with the parser service.

---

## 🏁 Conclusion

> "With Task 14 complete, we have a fully unified hiring progress tracker and a smart, production-ready skill extraction parser."
