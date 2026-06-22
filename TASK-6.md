# Task 6 — Payments Design & Gateway Setup

## Overview

Exposes secure endpoints and designs a relational payment data model to handle candidate job application fees. Integrates the Razorpay gateway in test mode to support atomic checkout order generation and signature verification, completely resolving the "half-completed payment" failure mode.

---

## New Files

| File | Purpose |
|------|---------|
| `src/modules/payments/payment.schemas.js` | Zod schemas validating checkout details and verification signature payloads |
| `src/modules/payments/payment.service.js` | Core payment logic including checkout creation, signature verification, and atomic database transaction processing |
| `src/modules/payments/payment.routes.js` | Fastify endpoint handlers for checkout and signature verification |
| `tests/payment.test.js` | Integration tests verifying the checkout creation, validation checks (skill thresholds and suspensions), and verification success/failure states |

## Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `PaymentStatus` enum, `Payment` model, and relations to `User` and `Job` collections. |
| `src/config.js` | Added configurations for `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` with defaults. |
| `src/app.js` | Registered the new `paymentRoutes` under the `/api/v1/payments` prefix. |

---

## API Endpoints

Both checkout and verification endpoints require candidate authentication via JWT.

### 💳 1. Payment Checkout Order
#### `POST /api/v1/payments/checkout`
Allows a student to initiate a payment checkout to apply for a published job.

**Request Body:**
```json
{
  "jobId": "685400000000000000000003",
  "skills": [
    { "skill": "React", "level": 80 }
  ]
}
```

- **Validation & Business Logic**:
  - The job must be `PUBLISHED` and the company status must not be `SUSPENDED`.
  - The candidate's skills are validated against the job's thresholds (missing or below-threshold skills are rejected with `400 VALIDATION_ERROR` before any payment is initiated).
  - A Razorpay Order is created on the gateway for ₹100 (10000 paise).
  - A `PENDING` payment record is saved, securely locking the verified candidate skills payload (`skillsJson`) to prevent client-side tampering during checkout.

**Response (201 Created):**
```json
{
  "data": {
    "paymentId": "685400000000000000000004",
    "gatewayOrderId": "order_fake123",
    "amount": 10000,
    "currency": "INR",
    "keyId": "rzp_test_fakeKeyId123"
  }
}
```

---

### 🔑 2. Payment Signature Verification
#### `POST /api/v1/payments/verify`
Verifies the signature returned by the Razorpay checkout modal and activates the application.

**Request Body:**
```json
{
  "gatewayOrderId": "order_fake123",
  "gatewayPaymentId": "pay_fake123",
  "gatewaySignature": "e67406a7246411cd72ecb7eb7a00f2e0f7690623d3876805b8a6a1668ad93d14"
}
```

- **Verification & Transaction**:
  - Verifies the HMAC-SHA256 signature against `gatewayOrderId|gatewayPaymentId` using the gateway secret key.
  - On signature mismatch, the payment record is updated to `FAILED` and rejected with `400 INVALID_SIGNATURE`.
  - On success, updates the payment record to `COMPLETED` and creates the `Application` along with candidate skills **atomically inside a database transaction**. This guarantees that the candidate is never charged without the application being successfully created.

**Response (200 OK):**
```json
{
  "data": {
    "id": "685400000000000000000005",
    "jobId": "685400000000000000000003",
    "userId": "685400000000000000000001",
    "status": "PENDING",
    "createdAt": "2026-06-22T08:00:00.000Z",
    "updatedAt": "2026-06-22T08:00:00.000Z",
    "candidateSkills": [
      { "id": "candidate-skill-1", "skill": "React", "level": 80 }
    ]
  }
}
```

---

## Running Tests

To verify the payment validations and signature check logic:

```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```

All 64 tests covering:
- Creating Razorpay checkout orders with skill validations.
- Verification signature match / mismatch.
- Company suspension blocks on checkouts and verification.
- Full application workflow.
will run and pass successfully.
