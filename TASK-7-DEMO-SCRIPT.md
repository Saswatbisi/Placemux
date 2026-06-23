# Task 7 — Pay-per-Application Demo Presentation & Execution Script

This script is structured to help you present and execute the demo of **Task 7: Pay-per-Application Flow** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction

> "Hi everyone. Today, I'm presenting the backend implementation for **Task 7: Pay-per-Application Flow**.
> The focus of this task is capturing the payment via the gateway and gating the job application creation upon it. This ensures that no candidate can apply to a job without completing their payment first."

### 2. Gating and Gateway Capturing Architecture

> "To establish a fully secured pay-per-application flow, we built two critical layers:
>
> 1.  **Gating the direct application endpoint**: When a candidate attempts to apply directly using `POST /api/v1/jobs/:jobId/applications`, the backend queries the database for a `COMPLETED` payment record matching that candidate and job. If no record exists, the request is rejected immediately with a `402 Payment Required` error.
> 2.  **Explicit Razorpay capturing**: During signature verification in `/api/v1/payments/verify`, signature verification is followed by a direct API request to Razorpay to fetch payment details.
> 3.  We validate that the gateway's recorded payment amount matches our database to prevent tampering.
> 4.  If the payment status on the gateway is `authorized` but not yet captured, the backend explicitly invokes Razorpay's capture API to secure the funds. The application is only created upon successful capture verification."

### 3. Execution Verification

> "Let's demonstrate the functionality. We have updated our integration tests to cover the payment gating block and verify gateway status and amount mismatches. All 67 tests pass successfully."

---

## 🚀 Execution & Demo Flow

Follow these execution steps during the live demo:

### Step 1: Run the Linter

Verify that the codebase complies with all coding conventions:

```bash
npm run lint
```

_Expected Output: Runs cleanly without errors._

### Step 2: Run All 67 Automated Tests

Run the Vitest suite sequentially to show all tests passing:

```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```

_Expected Output:_

- `tests/application.test.js` passes with the new test:
  - `POST /api/v1/jobs/:jobId/applications — rejects if no completed payment exists`
- `tests/payment.test.js` passes with the new tests:
  - `POST /api/v1/payments/verify — rejects if gateway payment amount/currency mismatches`
  - `POST /api/v1/payments/verify — rejects and sets payment to FAILED if gateway status is failed`
- All 67 tests pass.

### Step 3: Walk Through the Secure Code

Show the following code blocks to demonstrate robustness:

1.  **[application.service.js (Gating check)](file:///d:/VS%20Code/Placemux/src/modules/applications/application.service.js#L103-L121)**: Point out how we check for a completed payment record and throw `402 PAYMENT_REQUIRED`.
2.  **[payment.service.js (Fetch and capture)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L180-L245)**: Point out how we fetch payment details from Razorpay, validate details (amounts and currency), check for failed statuses, and explicitly call `payments.capture`.

---

## 🏁 Conclusion

> "With this gated pay-per-application flow, we have secured the monetization loop and ensured that database records are in perfect alignment with the payment gateway status."
