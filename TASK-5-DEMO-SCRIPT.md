# Task 5 — Demo Presentation & Execution Script

This script is structured to help you present and execute the demo of **Task 5: Marketplace Integration & Company Portal v1** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction
> "Hi everyone. Today, I'm going to walk you through the backend implementation for **Task 5: Marketplace Integration & Company Portal v1**. 
> The core goal of this task was to stabilize our marketplace APIs, ensure strict business logic verification (specifically around candidate skill thresholds and company suspensions), and optimize our database for high-scale public searches."

### 2. What We Built & Solved
> "We resolved several critical gaps in the integration:
> 
> *   **First: Skill Threshold Enforcement.** Previously, candidates could apply to jobs even if their skill levels were below the job's minimum requirement. Now, the API strictly validates skill levels during applications and blocks any candidates who do not qualify, returning a standard `400 VALIDATION_ERROR`.
> *   **Second: Company Suspension Checks.** We implemented robust company state validation. If a company is marked as `SUSPENDED`, the system automatically restricts any state changes. They cannot post jobs, update company profiles, or shortlist candidates. Additionally, jobs from suspended companies are instantly filtered out from public searches and discovery facets.
> *   **Third: Search Index Optimizations.** To prevent database collection scans as our job listings grow, we added database indexes on the `Job` model for status, creation dates, location, and employment types."

### 3. Execution Verification
> "Let's look at the execution. We've written comprehensive tests to cover these new constraints. We'll run the full suite of 59 tests sequentially to prove correctness and ensure there are no regressions."

---

## 🚀 Execution & Demo Flow

Follow these terminal execution steps during the live demo:

### Step 1: Run the Linter
Show that the codebase is completely clean and follows formatting guidelines:
```bash
npm run lint
```
*Expected Output: Runs without errors.*

### Step 2: Run All 59 Automated Tests
Run the Vitest suite sequentially to show all tests passing, including the new validation rules:
```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```
*Expected Output:*
- `tests/application.test.js` passes with the new test: `POST /api/v1/jobs/:jobId/applications — rejects if skill levels are below threshold`.
- `tests/company.status.test.js` passes with tests checking:
  - `blocks job creation for members of a suspended company`
  - `blocks profile updates for members of a suspended company`
  - `blocks applying to a job belonging to a suspended company`
- All 59 tests pass successfully.

---

## 🏁 Conclusion
> "With these fixes, our marketplace base is stable, fully verified by automated tests, and optimized to handle scale. We are now ready to hand this off to the next team for the Phase 3 payments integration."
