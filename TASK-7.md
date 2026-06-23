# Task 7 — Pay-per-Application Flow

## Overview

Secures the job application process by gating direct job applications behind a completed payment constraint and introducing explicit Razorpay gateway verification and capture steps. This resolves the possibility of a candidate applying without paying, and guarantees payment validation consistency (e.g. verifying amounts and capturing authorized payments) during signature checks.

---

## Modified Files

| File                                              | Change                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/modules/payments/payment.service.js`         | Updated `verifyPayment` to explicitly fetch the payment details from Razorpay, validate that the payment amount/currency match the database record, check for payment status `failed`, and explicitly capture the payment if it is in an `authorized` state. |
| `src/modules/applications/application.service.js` | Gated direct application creation (`applyToJob`) by verifying if a record exists in the `Payment` collection with status `COMPLETED` for the corresponding candidate and job. Raises `402 PAYMENT_REQUIRED` if none is found.                                |
| `tests/payment.test.js`                           | Extended the Vitest suite to mock Razorpay's `payments.fetch` and `payments.capture` methods and added test cases checking for amount/currency mismatches and gateway-failed states.                                                                         |
| `tests/application.test.js`                       | Updated the test-level database mockup to support the payment query interface and added integration tests confirming that direct applications are blocked (`402 PAYMENT_REQUIRED`) when no completed payment exists.                                         |
| `tests/company.status.test.js`                    | Updated the test-level database mockup to support the payment query interface to maintain compatibility.                                                                                                                                                     |

---

## API Endpoints

### 🔒 1. Gated Direct Apply Endpoint

#### `POST /api/v1/jobs/:jobId/applications`

Allows a student to submit an application directly for a published job.

- **Payment Gating Check**:
  - Checks if a `COMPLETED` payment record exists in the database for the calling candidate (`userId`) and the job (`jobId`).
  - If a completed payment record does not exist, the request is blocked with `402 PAYMENT_REQUIRED`.
  - Normal skill thresholds, duplicate application checks, and company suspension validation are still performed on successful paths.

**Response (402 Payment Required):**

```json
{
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Payment is required to apply for this job",
    "requestId": "req_123456"
  }
}
```

---

### 💳 2. Payment signature verification & Capture

#### `POST /api/v1/payments/verify`

Verifies signature and explicitly queries and captures payment with Razorpay.

- **Gateway Capture Logic**:
  - After HMAC signature verification succeeds, fetches the payment transaction details from the Razorpay API using `gatewayPaymentId`.
  - Verifies that the payment amount and currency returned by the gateway match the payment record in the database.
  - If the payment is in a `failed` state on the gateway, updates the database status to `FAILED` and throws `400 PAYMENT_FAILED`.
  - If the payment is in an `authorized` state, explicitly calls Razorpay's capture API to capture the transaction.
  - Creates the application atomically inside a Prisma transaction on successful capture verification.

---

## Running Tests

To verify that the payment capture logic and direct application gating constraints are completely correct:

```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```

All 67 tests covering checkouts, signature mismatch, gateway capturing, amount mismatch, company suspension, and payment gating will run and pass successfully.
