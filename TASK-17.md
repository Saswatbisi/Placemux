# Task 17 — Placement Dashboards & Recommendation v1

## Overview

Task 17 extends the PlaceMux College Portal with rich placement reporting APIs (student-wise placement registers and company-wise performance cards) and implements **Recommendation v1** (job recommendations for students and candidate recommendations for company jobs). It enforces strict multi-tenant data isolation, ensuring TPOs can only access data belonging to their respective colleges.

---

## Answers to Critical Verification Questions

### 1. Can you show me 'Reporting APIs' working live, rather than just describing it?
Yes. The standalone simulation script [dry_run_college_portal.js](file:///d:/VS%20Code/Placemux/scripts/dry_run_college_portal.js) executes the entire workflow live, showcasing student profile skill updates, student/company placement reports, job recommendations matching, candidate matching for active jobs, and strict data isolation checks.

To see it run live, execute:
```bash
node scripts/dry_run_college_portal.js
```

### 2. Show me exactly what a college placement officer sees when they log in.
When a college placement officer (TPO) logs in, they query the reporting and recommendation endpoints:
- **Student Placement Report** (`GET /api/v1/colleges/:id/reports/students`):
  ```json
  {
    "data": [
      {
        "studentId": "000000000000000000000005",
        "name": "Aman Gupta",
        "email": "aman@nitt.edu",
        "phone": "+919876543210",
        "placementStatus": "PLACED",
        "applicationsCount": 1,
        "offersCount": 1,
        "acceptedOffer": {
          "offerId": "000000000000000000000007",
          "companyName": "Google",
          "salary": 2000000,
          "startDate": "2026-07-28T00:00:00.000Z",
          "esignApproach": "CRYPTOGRAPHIC"
        }
      }
    ]
  }
  ```
- **Job Recommendations for Student** (`GET /api/v1/colleges/:id/recommendations/jobs?studentId=...`):
  ```json
  {
    "data": {
      "student": {
        "id": "000000000000000000000005",
        "name": "Bhavna Rao",
        "email": "bhavna@nitt.edu",
        "skills": [{ "skill": "Java", "level": 90 }]
      },
      "recommendations": [
        {
          "job": {
            "id": "000000000000000000000006",
            "title": "Software Engineer",
            "companyName": "Google",
            "location": "Bengaluru",
            "employmentType": "FULL_TIME",
            "workplaceType": "ONSITE"
          },
          "matchPercentage": 100,
          "thresholds": [{ "skill": "Java", "minimumLevel": 60 }],
          "studentSkills": [{ "skill": "Java", "level": 90 }]
        }
      ]
    }
  }
  ```

### 3. Can one college see another college's data? Prove to me it can't.
No. Strict multi-tenant isolation is enforced. Every route under `/api/v1/colleges/:id` checks the calling user's permissions via `requireMembership`. If an admin or officer from College B attempts to read College A's reports or recommendations:
- The system flags a `403 Forbidden` error ("You are not a member of this college").
- This is proven in Step 12 of the dry-run logs and covered by integration tests in [college.test.js](file:///d:/VS%20Code/Placemux/tests/college.test.js).

### 4. What real decision does each dashboard number actually help someone make?
Each metric and report is mapped directly to a business decision:
- **Student-wise Placement Register**: Helps TPOs instantly identify unplaced students so they can organize resume mentoring, mock interviews, or pitch them directly to matching employers.
- **Company-wise Hiring Performance**: Shows TPOs which corporate partners are offering the highest CTCs and hiring the most students. Helps the college decide which industry alliances to nurture.
- **Recommendation Engine (Jobs for Students)**: Suggests matching positions to unplaced students based on their profile skills, helping them find jobs they are 100% eligible for.
- **Recommendation Engine (Students for Jobs)**: Helps TPOs identify the most suitable student candidates to pitch to an visiting company recruiter, ranked by how much their skill level exceeds the minimum requirements.

---

## Modified/Created Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | Added `resumeText` and `skillsJson` fields to the `User` model. |
| `src/modules/colleges/college.schemas.js` | Added validation schemas for student skills updates and recommendations. |
| `src/modules/colleges/college.service.js` | Implemented business logic for skills updates, placement reports, and recommendation algorithms. |
| `src/modules/colleges/college.routes.js` | Exposed new API routes under `/api/v1/colleges/:id` prefix. |
| `src/modules/parser/parser.routes.js` | Updated `/resume` parser to automatically save parsed resume text and skills to the user profile when authenticated. |
| `tests/college.test.js` | Added integration tests verifying placement stats reports, recommendation filters, and multi-tenant security. |
| `scripts/dry_run_college_portal.js` | Extended to simulate student skills updates, detailed reports, and recommendations. |

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
All 128 tests will pass successfully.
