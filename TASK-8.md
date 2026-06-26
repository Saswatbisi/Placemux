# Task 8 — Receipts, Refunds & Reconciliation

## Overview

Introduces support for issuing completed payment receipts, processing refunds, crypto-verifying Razorpay webhooks, and generating daily reconciliation reports to ensure database and payment gateway alignment.

---

## Modified Files

| File                                      | Change                                                                                                                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                    | Added `REFUNDED` status to the `PaymentStatus` enum. Extended `Payment` model with `gatewayRefundId` and `refundedAt` fields.                                                                                                                   |
| `src/config.js`                           | Defined `RAZORPAY_WEBHOOK_SECRET` configuration with default testing secrets.                                                                                                                                                                   |
| `src/modules/payments/payment.schemas.js` | Added schemas for verifying path parameters (`paymentIdParamsSchema`) and date queries (`reconciliationQuerySchema`).                                                                                                                           |
| `src/modules/payments/payment.service.js` | Implemented receipt lookup (`getReceipt`), atomic refund processing and application deletion (`refundPayment`), detailed daily gateway alignment checks (`reconcilePayments`), and webhook verification and capture routines (`handleWebhook`). |
| `src/modules/payments/payment.routes.js`  | Registered routes for webhook, reconciliation, receipts, and refunds; updated route hooks to exempt webhooks from JWT authorization checks.                                                                                                     |
| `tests/payment.test.js`                   | Extended unit mocks for `razorpay` (`refunds.create`, `payments.all`) and implemented 9 new test cases covering all happy and failure paths.                                                                                                    |

---

## API Endpoints

### 🧾 1. Get Payment Receipt

#### `GET /api/v1/payments/:id/receipt`

Retrieves receipt details for a completed payment.

- **Rules**: Must belong to the authenticated calling user and payment status must be `COMPLETED`.

**Response (200 OK):**

```json
{
  "data": {
    "receiptNumber": "REC-000004-FAKE12",
    "paymentId": "685400000000000000000004",
    "gatewayPaymentId": "pay_fake123",
    "gatewayOrderId": "order_fake123",
    "amount": 10000,
    "currency": "INR",
    "status": "COMPLETED",
    "issuedAt": "2026-06-23T10:00:00.000Z",
    "candidate": {
      "name": "Aarav Sharma",
      "email": "aarav@example.com"
    },
    "job": {
      "title": "React Developer",
      "companyName": "Acme Corp"
    }
  }
}
```

---

### 💸 2. Request Refund

#### `POST /api/v1/payments/:id/refund`

Refunds a payment and cancels the candidate's job application.

- **Rules**: Only completed payments belonging to the authenticated user can be refunded. Updates payment status to `REFUNDED` and deletes the associated `Application` record atomically inside a database transaction.

**Response (200 OK):**

```json
{
  "data": {
    "id": "685400000000000000000004",
    "userId": "685400000000000000000001",
    "jobId": "685400000000000000000003",
    "amount": 10000,
    "currency": "INR",
    "status": "REFUNDED",
    "gatewayOrderId": "order_fake123",
    "gatewayPaymentId": "pay_fake123",
    "gatewaySignature": "sig_fake123",
    "gatewayRefundId": "ref_fake123",
    "refundedAt": "2026-06-23T10:05:00.000Z"
  }
}
```

---

### 🔔 3. Webhook Receiver

#### `POST /api/v1/payments/webhook`

Handles asynchronous payment notifications from Razorpay.

- **Rules**: Exempt from JWT auth. Crypto-verifies webhook headers using `x-razorpay-signature` and `RAZORPAY_WEBHOOK_SECRET`.
  - `payment.captured`: Completes payment and creates the application.
  - `payment.failed`: Marks payment status as `FAILED`.

---

### 📊 4. Daily Reconciliation Report

#### `GET /api/v1/payments/reconciliation`

Generates a report comparing database records and Razorpay records for a target date.

- **Query Params**: `date` (`YYYY-MM-DD`, optional, defaults to today).
- **Rules**: Identifies:
  - `MISSING_ON_GATEWAY`: DB record marked completed but missing on gateway.
  - `STATUS_MISMATCH`: Payment statuses do not align.
  - `AMOUNT_MISMATCH`: Payment amounts do not match.
  - `MISSING_IN_DB`: Gateway shows captured payment but DB has no record.

**Response (200 OK):**

```json
{
  "data": {
    "date": "2026-06-23",
    "reconciliationStatus": "MATCHED",
    "totalAmountDb": 10000,
    "totalAmountGateway": 10000,
    "dbCount": 1,
    "gatewayCount": 1,
    "reconciledCount": 1,
    "discrepancyCount": 0,
    "discrepancies": []
  }
}
```

---

## Running Tests

To run the complete verification test suite containing all 76 unit and integration tests:

```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```
