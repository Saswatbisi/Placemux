# Task 6 — Payments Demo Presentation & Execution Script

This script is structured to help you present and execute the demo of **Task 6: Payments Design & Gateway Setup** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction

> "Hi everyone. Today, I'm going to present the backend implementation for **Task 6: Payments Design & Gateway Setup**.
> The focus of this task is integrating the Razorpay payment gateway in test mode to charge students a job application fee, designing the relational payment data model, and preventing common payment failure modes."

### 2. Solving the "Half-Completed Payment" Failure Mode

> "One of the most common pitfalls with gateways is the 'half-completed payment' where a user's card is charged but the application fails to save in our database, or vice versa.
> To solve this, we designed an atomic transaction flow:
>
> 1.  When a student clicks 'Apply', we run threshold checks. If they qualify, we initialize a `PENDING` payment record and a Razorpay checkout order.
> 2.  During this checkout creation, the backend securely locks the student's self-assessed skills inside `skillsJson` in the database. This prevents client-side tampering between checkout and payment.
> 3.  Once the student completes payment on the frontend, the signature is verified via HMAC-SHA256.
> 4.  If verification succeeds, we run a **Prisma database transaction** that updates the payment to `COMPLETED` and creates the `Application` record atomically. It is impossible for one to succeed without the other."

### 3. Execution Verification

> "Let's demonstrate this in the terminal. We've added comprehensive integration tests for payments checkout, validation failures, signature verification mismatch, and suspension blocks. All 64 tests pass successfully."

---

## 🚀 Execution & Demo Flow

Follow these execution steps during the live demo:

### Step 1: Run the Linter

Verify that the codebase complies with all coding conventions:

```bash
npm run lint
```

_Expected Output: Runs cleanly without errors._

### Step 2: Run All 64 Automated Tests

Run the Vitest suite sequentially to show all tests passing, including the new payment scenarios:

```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```

_Expected Output:_

- `tests/payment.test.js` passes with:
  - `POST /api/v1/payments/checkout — student successfully initiates checkout with valid skills`
  - `POST /api/v1/payments/checkout — rejects if skills are below threshold`
  - `POST /api/v1/payments/checkout — rejects if company is suspended`
  - `POST /api/v1/payments/verify — verifies payment and creates application on success`
  - `POST /api/v1/payments/verify — rejects and sets payment to FAILED on signature mismatch`
- All 64 tests pass.

### Step 3: Walk Through the Secure Code

Show the following code blocks to demonstrate robustness:

1.  **[payment.service.js (Checkout)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L96-L121)**: Point out how we create a pending payment record and store serialized candidate skills.
2.  **[payment.service.js (Verification Transaction)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L210-L245)**: Point out how `db.$transaction` updates payment status to `COMPLETED` and calls `tx.application.create` atomically.
3.  **[schema.prisma](file:///d:/VS%20Code/Placemux/prisma/schema.prisma#L258-L274)**: Point out the new `Payment` model and relationships.

---

## 🏁 Conclusion

> "With this payments architecture, our platform now securely integrates gateway checkouts and handles transaction failures deterministically. We are ready to deploy to the test environment."
