# Task 17 — Placement Dashboards & Recommendation v1 Demo Script

This script is structured to help you present and execute the demo of **Task 17: Placement Dashboards & Recommendation v1** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎤 Spoken Script

> "Hi everyone. Today, I'm presenting the implementation of **Task 17: Placement Dashboards & Recommendation v1**.
> 
> A successful placement drive requires Placement Officers (TPOs) to have deep visibility into student outcomes and company hiring trends, as well as the tools to match students to the right roles.
> 
> Today, we have extended the College Portal by adding:
> 1. **Student Placement Register API**: A detailed list of all students, their placement status, application/offer counts, and their accepted job offer details.
> 2. **Company Performance API**: Aggregate statistics grouped by hiring companies, detailing application counts, total offers generated, and average CTC.
> 3. **Recommendation v1 Engine**: A matching engine that recommends jobs to unplaced students based on their profile skills, and suggests candidate recommendations to TPOs for open job requirements.
> 
> Let's run our standalone dry-run simulation script to see this in action."

---

## ⚙️ Execution Flow

### Step 1: Run the Standalone Dry Run Simulation
Run the live dry-run simulation of the college portal onboarding, placements tracking, reporting, and recommendation flow:
```bash
node scripts/dry_run_college_portal.js
```

#### What to highlight in the output:
- **Step 8**: Show the TPO updating the profile skills for Student B (Bhavna Rao) to include Java at level 90.
- **Step 9**: Point out the **Student Placement Report** showing Student A placed at Google with ₹20 LPA, and Student B unplaced. Point out the **Company Placement Report** showing Google with 1 application, 1 offer generated, and 1 accepted offer.
- **Step 10**: Demonstrate **Job Recommendations** suggesting the Software Engineer job at Google for Bhavna Rao because she meets the Java skill threshold.
- **Step 11**: Demonstrate **Student Recommendations** for the Software Engineer job, ranking Bhavna Rao higher (Suitability Match score of 30) than Aman Gupta (Suitability Match score of 20) because she exceeds the required level by 30 points.
- **Step 12**: Highlight the **Data Isolation checks** returning a strict `403 Forbidden` when Admin B tries to query College A's placement reports or recommendations.

### Step 2: Run the Integration Test Suite
Demonstrate the reliability of the system by executing the integration tests:
```bash
npm test
```
- Note that all 128 tests (including the 5 new integration tests for reports, recommendations, profile updates, and multi-tenant security) pass successfully.
