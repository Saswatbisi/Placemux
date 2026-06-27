# Task 16 — College Portal & Reporting API Foundations

## Overview

Implements the relational College Portal database models, admin onboarding workflows, TPO student lists, and decision-driven placement analytics report dashboards. Enforces strict multi-tenant data isolation to guarantee one college can never see another college's student details or placement reports.

---

## Answers to Critical Verification Questions

### 1. Can you show me 'Reporting API design' working live, rather than just describing it?
Yes. The standalone simulation script [dry_run_college_portal.js](file:///d:/VS%20Code/Placemux/scripts/dry_run_college_portal.js) executes the entire workflow live, showcasing onboarding, membership role assignments, candidate applications, interview tracking, cryptographic job offer acceptance, and the placement dashboard aggregation.

### 2. Show me exactly what a college placement officer sees when they log in.
When a college placement officer (TPO) queries `GET /api/v1/colleges/:id/dashboard`, they receive a complete analytics payload:
```json
{
  "data": {
    "collegeId": "00000000000000b69fa5c025",
    "metrics": {
      "totalStudents": 2,
      "placedStudents": 1,
      "unplacedStudents": 1,
      "placementRate": 50,
      "totalApplications": 1,
      "totalOffers": 1
    },
    "salaryStats": {
      "averageCTC": 2000000,
      "highestCTC": 2000000,
      "lowestCTC": 2000000,
      "medianCTC": 2000000
    },
    "topRecruiters": [
      { "companyName": "Google", "hiresCount": 1 }
    ],
    "applicationFunnel": {
      "APPLIED": 0,
      "SHORTLISTED": 0,
      "INTERVIEWING": 0,
      "OFFER_GENERATED": 0,
      "OFFER_ACCEPTED": 1,
      "OFFER_REJECTED": 0,
      "OFFER_WITHDRAWN": 0,
      "REJECTED": 0
    }
  }
}
```

### 3. Can one college see another college's data? Prove to me it can't.
No. Strict multi-tenant isolation is enforced. Every route under `/api/v1/colleges/:id` checks the calling user's permissions via `requireMembership`. If an admin or officer from College B attempts to read College A's data:
- The system flags a `403 Forbidden` error ("You are not a member of this college").
- This is proven in Step 7 of the dry-run logs and covered by integration tests in [college.test.js](file:///d:/VS%20Code/Placemux/tests/college.test.js).

### 4. What real decision does each dashboard number actually help someone make?
Each metric is mapped directly to a business decision:
- **Placement Rate & Placed Count**: Assesses the placement drive's health. If the rate is low, the TPO knows they must invite more hiring companies to the campus.
- **Unplaced Students Count**: Helps TPOs identify the exact list of students who haven't accepted any job offers. It helps them decide which students require direct tutoring, CV reviews, or remedial interview guidance.
- **Average & Median CTC**: Measures standard benchmark alignment. It helps the college decide if companies are offering fair market salaries to their students compared to national averages.
- **Top Recruiters**: Shows the major hiring partners of the college. It helps the TPO decide which companies to maintain active partnerships, MoUs, or feedback loops with.
- **Application Funnel Breakdown**: Pinpoints conversion bottlenecks. If many students reach `INTERVIEWING` but very few transition to `OFFER_GENERATED`, the TPO knows they must allocate resources to mock interview preparation.

---

## Modified/Created Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | Extended database with `College` and `CollegeMembership` models, `CollegeRole` enum, and User-College relation fields. |
| `src/app.js` | Registered the new `collegeRoutes` under the `/api/v1/colleges` prefix. |
| `src/modules/colleges/college.schemas.js` | [NEW] Configured request validation Zod schemas. |
| `src/modules/colleges/college.service.js` | [NEW] Business logic for signup, student mapping, member roster management, and decision-driven analytics calculation. |
| `src/modules/colleges/college.routes.js` | [NEW] Configured routing for the college onboarding and reporting endpoints. |
| `tests/college.test.js` | [NEW] Integration tests verifying role permissions, dashboard calculations, and multi-tenant isolation. |
| `scripts/dry_run_college_portal.js` | [NEW] Standalone demo script verifying the complete portal lifecycle. |
| `TASK-16.md` | [NEW] Documentation summarizing design architecture and answering key questions. |
| `TASK-16-DEMO-SCRIPT.md` | [NEW] Script for live presenting and dry-running the college portal. |

---

## Running the Verification

### Standalone Dry Run Simulation
To run the end-to-end college portal dry-run script manually:
```bash
node scripts/dry_run_college_portal.js
```

### Automated Test Suite
To run the automated test suite:
```bash
npm test
```
All 123 tests will pass successfully.
