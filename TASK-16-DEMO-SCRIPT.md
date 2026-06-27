# Task 16 — College Portal & Reporting API Foundations Demo Script

This script is structured to help you present and execute the demo of **Task 16: College Portal & Reporting API Foundations** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction

> "Hi everyone. Today, I'm presenting the implementation of **Task 16: College Portal & Reporting API Foundations**.
> Placement automation requires college administrations and Placement Officers to manage corporate engagements, track their student rosters, and assess placement drive success. In this task, we've designed the relational database schema, established the TPO onboarding pipeline, and built a decision-driven analytics reporting dashboard with multi-tenant data isolation."

### 2. Key Architecture Features

> "We've built three core capabilities:
>
> 1. **College Portal & Admin Onboarding**:
>    - We integrated the new `College` and `CollegeMembership` models.
>    - Developed the onboarding route `POST /api/v1/colleges/signup` which creates the college and registers the first admin atomically.
>    - Enabled admins to add officers and associate students via email.
> 
> 2. **Multi-Tenant Data Isolation**:
>    - Strict access checking blocks unauthorized users. A user must be an active member of the college to pull dashboard or student data. IIT Delhi admins cannot see NIT Trichy data, preventing information leaks.
> 
> 3. **Placement Report Dashboard**:
>    - Calculates placement rates, student stats, average/median salaries, top recruiting companies, and the full hiring funnel breakdown.
>    - Translates metrics into business decisions (e.g. tracking unplaced students for CV workshops, funnel drop-offs for interview prep)."

### 3. Execution Verification

> "Let's run our test suites and our standalone simulation script. We have added a dedicated Vitest suite and a standalone dry-run simulation. All checks execute successfully."

---

## 🚀 Execution & Demo Flow

### Step 1: Run the Standalone Dry Run Simulation

This script executes the entire college portal onboarding, student adding, placement tracking, and data isolation flow:

```bash
node scripts/dry_run_college_portal.js
```

_Expected Output: The console logs step-by-step NIT Trichy onboarding, student addition, application, offer signing, NIT Trichy placement dashboard stats, and a blocked cross-college read from an IIT Delhi admin._

### Step 2: Run the Updated Tests

Verify test execution via vitest:

```bash
npx vitest run tests/college.test.js
```

_Expected Output: All 5 college portal tests pass successfully._

To run the complete test suite:

```bash
npm test
```

_Expected Output: All 123 tests pass successfully._

### Step 3: Code Walkthrough

Show the following files during the walkthrough:

1. **[schema.prisma](file:///d:/VS%20Code/Placemux/prisma/schema.prisma#L344)**: Show the new `College`, `CollegeMembership` models and their relation to the `User` model.
2. **[college.service.js](file:///d:/VS%20Code/Placemux/src/modules/colleges/college.service.js#L189)**: Walk through the `getCollegeDashboard` method, showing how metrics, salary CTC stats (average, highest, lowest, median), top recruiters list, and application funnel breakdown are dynamically calculated.
3. **[college.routes.js](file:///d:/VS%20Code/Placemux/src/modules/colleges/college.routes.js#L29)**: Point out how authenticated routes are nested in a separate register block to apply the authentication check, leaving `/signup` public.

---

## 🏁 Conclusion

> "With Task 16 complete, our College Portal foundation is robust, secure, and ready for frontend integration."
