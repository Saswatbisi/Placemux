# Task 18 — Admin Console & Review Queue Demo Script

This script is structured to help you present and execute the demo of **Task 18: Admin Console & Review Queue** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎤 Spoken Script

> "Hi everyone. Today, I'm presenting the implementation of **Task 18: Admin Console & Review Queue**.
> 
> Maintaining trust and integrity in a skill-verified hiring marketplace is critical. While AI-proctored assessments flag anomalies, platform administrators must be able to manage the Item Bank questions and audit suspicious candidate attempts.
> 
> Today, we have added:
> 1. **Item Bank APIs**: Full CRUD operations to create, read, update, and delete assessment questions, categorized by skill keys and difficulty levels.
> 2. **Proctoring Review Queue**: An queue of pending attempts ordered by AI-flagged suspicious anomalies descending, so admins can focus on high-risk cases.
> 3. **Malpractice Auto-Rejection**: Logic that automatically rejects a candidate's job application and updates their tracking records when an admin confirms malpractice.
> 4. **Administrative Security Gates**: A validation hook that restricts all `/api/v1/admin` routes only to users with the `ADMIN` role.
> 
> Let's run our standalone dry-run simulation script to see this in action."

---

## ⚙️ Execution Flow

### Step 1: Run the Standalone Dry Run Simulation
Run the live dry-run simulation of the admin console and review queue flow:
```bash
node scripts/dry_run_admin_console.js
```

#### What to highlight in the output:
- **Step 1**: Show the admin adding a new React assessment question to the Item Bank.
- **Step 2**: Point out the admin searching the Item Bank with filters for skill key `react` and difficulty `MEDIUM`.
- **Step 3**: Point out the admin updating the question's difficulty level to `HARD`.
- **Step 5**: Demonstrate the **Proctoring Queue** listing attempts pending manual review (showing Aman Gupta's attempt with 5 proctoring flags).
- **Step 6**: Submit a verdict of `CONFIRMED_MALPRACTICE` with audit notes.
- **Step 7**: Highlight the **Malpractice Auto-Rejection** verifying that Aman's application and tracking records are now updated to `REJECTED`.
- **Step 8**: Demonstrate the **Role Security Gates** rejecting the student's attempt to access the proctoring queue with a `403 Forbidden` error.

### Step 2: Run the Integration Test Suite
Demonstrate the reliability of the system by executing the integration tests:
```bash
npm test
```
- Note that all 133 tests (including the 5 new integration tests for the admin console and proctoring queue) pass successfully.
