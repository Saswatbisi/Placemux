# Task 9 — Failure Handling & Resilience

## Overview

Ensures the payment processing pipeline handles failures deterministically. By automatically initiating gateway-level refunds if application creation or business logic checks (such as company suspension or duplicate application validation) fail after payment capture, we eliminate "half-completed payment" scenarios. This task also logs precise failure reasons in the database and reports them in daily reconciliation audits, ensuring full observability.

---

## Modified Files

| File                                      | Change                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                    | Extended the `Payment` model with a nullable `failureReason` field (`failureReason String? @map("failure_reason")`).                                                                                                                                                                                                                                                                             |
| `src/modules/payments/payment.service.js` | Updated `verifyPayment` and `handleWebhook` to wrap business logic and database transaction blocks in try-catch statements. If a validation fails after payment capture, the system triggers an automatic refund via Razorpay, logs the exception in `failureReason`, and transitions the status to `FAILED`. Updated `reconcilePayments` to include the `failureReason` in discrepancy reports. |
| `tests/payment.test.js`                   | Appended 5 new integration tests verifying that `verifyPayment` and `handleWebhook` correctly trigger automatic refunds on gateway capture when company is suspended or when duplicate applications occur. Verified that `payment.failed` webhook events parse and record failure reasons.                                                                                                       |

---

## API Endpoints

### 💳 1. Payment Verification & Auto-Refund

#### `POST /api/v1/payments/verify`

Verifies payment signature, fetches details, captures the payment, and completes the application creation.

- **Resilience Upgrade**: If the signature matches and payment is captured, but the job's company status is `SUSPENDED` or the candidate has `already applied` to the job (or if any database transaction failure occurs), the backend will automatically:
  1. Record the transaction status as `FAILED` in the database.
  2. Call the Razorpay API to issue a full refund to the user.
  3. Log the specific failure cause (e.g. `"This company is suspended"`, `"You have already applied..."`) in the `failureReason` field of the payment record.

---

### 🔔 2. Webhook Receiver with Auto-Refund

#### `POST /api/v1/payments/webhook`

Handles asynchronous webhook alerts from Razorpay.

- **`payment.captured` event**: If database operations or business safety checks fail during webhook parsing after successful capture, the backend automatically issues a refund on Razorpay and marks the database payment record as `FAILED` with the `failureReason`.
- **`payment.failed` event**: The webhook receiver extracts the failure details from the payload (`error_description` or `error_code`) and logs it in `failureReason` when setting the payment status to `FAILED`.

---

### 📊 3. Observable Reconciliation Reports

#### `GET /api/v1/payments/reconciliation`

Generates a report comparing database records and Razorpay records for audit verification.

- **Resilience Upgrade**: Discrepancies returned (`MISSING_ON_GATEWAY`, `STATUS_MISMATCH`, etc.) now include the `failureReason` field in their details section, making it straightforward to inspect exactly why a transaction failed.

---

## Running Tests

To verify that all failure handling and automatic refund logic runs perfectly:

```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```

All 81 tests will run and pass successfully.
