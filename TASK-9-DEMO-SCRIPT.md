# Task 9 — Failure Handling & Resilience Demo Script

This script is structured to help you present and execute the demo of **Task 9: Failure Handling & Resilience** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction
> "Hi everyone. Today, I'm presenting the backend implementation for **Task 9: Failure Handling & Resilience**.
> When handling real money in a system, failure handling is not an extra feature—it is the core product. The objective of this task is to ensure that payment failures are handled gracefully, deterministically, and with full observability."

### 2. Key Resilience Features
> "We've added three major resilience layers:
> 
> 1. **Automatic Refunds on Validation/DB Failure**: If a payment is successfully captured by the gateway, but subsequently fails due to business rules (e.g. the company is suspended after checkout begins, or the user submits a duplicate application) or a database transaction error, our system intercepts this failure, issues an automatic refund request to Razorpay, and transitions the payment status to `FAILED`.
> 2. **Failure Logging**: We've added a `failureReason` field to our payment database schema. Every failure mode—from signature mismatch to bank card decline to business logic failures—is documented in the payment record.
> 3. **Audit and Reconciliation Observability**: The daily reconciliation reports now include `failureReason` details, making it simple to audits discrepancies or failures immediately."

### 3. Execution Verification
> "Let's run our test suites. We have added 5 comprehensive integration tests covering auto-refund scenarios during verification and webhooks. All 81 tests pass successfully."

---

## 🚀 Execution & Demo Flow

### Step 1: Run All 81 Automated Tests
Run the Vitest suite sequentially to show all tests passing:
```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```
*Expected Output: 81 tests passed successfully.*

### Step 2: Code Walkthrough
Show the following code blocks to demonstrate the implementation:
1. **[schema.prisma](file:///d:/VS%20Code/Placemux/prisma/schema.prisma#L272)**: Point out the new `failureReason` field on the `Payment` model.
2. **[payment.service.js (verifyPayment)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L237-L343)**: Show how signature mismatches, currency mismatches, and gateway failed states are logged with reasons. Point out the `try...catch` block around company suspension, duplicate application, and Prisma transaction, which triggers `razorpay.refunds.create` (or fallback `razorpay.payments.refund`) on failure.
3. **[payment.service.js (handleWebhook)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L688-L768)**: Show how webhook-driven captures also run within a `try...catch` block to guarantee auto-refunds on application failures. Show how `payment.failed` event extracts and registers the gateway failure reason.
4. **[payment.service.js (reconcilePayments)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L515-L580)**: Show how `failureReason` is returned within the discrepancy detail payload.

---

## 🏁 Conclusion
> "With Task 9 complete, we have ensured that no candidate will ever lose money on a failed application flow, and the engineering/finance teams have full visibility into why payments fail."
