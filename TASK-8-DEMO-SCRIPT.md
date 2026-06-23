# Task 8 — Receipts, Refunds & Reconciliation Demo script

This script is structured to help you present and execute the demo of **Task 8: Receipts, Refunds & Reconciliation** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction
> "Hi everyone. Today, I'm presenting the backend implementation for **Task 8: Receipts, Refunds & Reconciliation**.
> The focus of this task is ensuring complete financial integrity, enabling secure refunds, generating receipts, and verifying synchronization between our records and the payment gateway."

### 2. Architectural Features
> "We implemented four major features for this phase:
> 
> 1. **Receipt Generation**: Completed payments can now generate detailed financial receipts containing candidate, job, amount, and date metadata.
> 2. **Secure Refunds**: User-initiated refunds are routed to the Razorpay refunds API. Upon success, we update the payment status to `REFUNDED` and atomically delete the associated job application to restore the candidate's seat and enforce application limits.
> 3. **Cryptographic Webhook Handlers**: We've set up a secure webhook endpoint to receive notifications from Razorpay. When a payment is captured or fails asynchronously (e.g. if a candidate closes their tab before hitting the verify redirect), the webhook automatically completes the transaction and creates the application.
> 4. **Daily Reconciliation Report**: This report fetches all database payments and matching gateway entries for a given date, checking for discrepancies like amount mismatches, status mismatches, and missing entries in either system."

### 3. Execution Verification
> "Let's run our test suites. We have added 9 comprehensive unit and integration tests covering receipts, refunds, webhooks, and reconciliation logic. All 76 tests in the codebase pass successfully."

---

## 🚀 Execution & Demo Flow

### Step 1: Run the Linter
Verify that the codebase complies with all styling and coding conventions:
```bash
npm run lint
```
*Expected Output: Runs cleanly without errors.*

### Step 2: Run All 76 Automated Tests
Run the Vitest suite sequentially to show all tests passing:
```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```
*Expected Output: 76 tests passed successfully.*

### Step 3: Code Walkthrough
Show the following code blocks to demonstrate the implementation:
1. **[schema.prisma](file:///d:/VS%20Code/Placemux/prisma/schema.prisma#L260-L274)**: Point out the new `REFUNDED` status, `gatewayRefundId`, and `refundedAt` columns on the `Payment` model.
2. **[payment.service.js (Receipts)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L309-L352)**: Point out how we check that the receipt belongs to the user and the payment is completed.
3. **[payment.service.js (Refunds)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L354-L425)**: Point out the Razorpay refund invocation and the atomic transaction updating the status to `REFUNDED` and deleting the job application.
4. **[payment.service.js (Webhooks)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L590-L706)**: Show the cryptographic webhook signature verification and how `payment.captured` creates the application.
5. **[payment.service.js (Reconciliation)](file:///d:/VS%20Code/Placemux/src/modules/payments/payment.service.js#L427-L588)**: Show how we compare database records with gateway records and catalog discrepancies.

---

## 🏁 Conclusion
> "With Task 8 complete, we have verified that all financial paths are fully handled, reconciled, and audited, providing a robust foundation before moving to real-money modes."
