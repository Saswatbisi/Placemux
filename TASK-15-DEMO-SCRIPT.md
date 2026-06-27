# Task 15 — Trust Layer Integration & Dry Run Demo Script

This script is structured to help you present and execute the demo of **Task 15: Trust Layer Integration & Dry Run** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction

> "Hi everyone. Today, I'm presenting the implementation and dry run of **Task 15: Trust Layer Integration & Dry Run**.
> Recruitment platforms deal with highly sensitive data—employment contracts, compensation figures, and payment-gated applications. Our focus for this task has been to stabilize the trust layer and perform a complete end-to-end dry run to verify authentication boundaries, state tracking, cryptographic e-signing, and active database tampering detection."

### 2. Key Architecture Features

> "We've verified and demonstrated the following core capabilities:
>
> 1. **End-to-End Status Pipeline**:
>    - We validated the entire unified state transition lifecycle: candidate app created (`APPLIED`), shortlisted (`SHORTLISTED`), interview set (`INTERVIEWING`), offer issued (`OFFER_GENERATED`), and cryptographically signed (`OFFER_ACCEPTED`).
> 
> 2. **Cryptographic eSign Validation**:
>    - When a candidate signs an offer using their legal name, we calculate a secure SHA-256 HMAC of the terms with the server's private key and save it as the signature hash.
> 
> 3. **Tamper-Evident Verification**:
>    - Our public verify endpoint recomputes this hash on the fly. If any database value (such as salary or start date) is quietly modified or altered directly in the database, the signature verification fails instantly, proving that the offer was tampered with."

### 3. Execution Verification

> "Let's run the test suites and the standalone simulation script. We have added a dedicated Vitest integration test and a standalone Node.js dry-run runner. All verifications complete with 100% success."

---

## 🚀 Execution & Demo Flow

### Step 1: Run the Standalone Dry Run Simulation

This script executes the entire hiring trust lifecycle end-to-end via Fastify HTTP routes using a self-contained in-memory database mock:

```bash
node scripts/dry_run_trust_layer.js
```

_Expected Output: The console will log each step from signup, job creation, payment checkout and verification, to status updates, cryptographic signing, valid public signature verification, and finally, database tampering detection._

### Step 2: Run the Updated Tests

Verify test execution via vitest:

```bash
npx vitest run tests/trust-layer-dry-run.test.js
```

_Expected Output: The trust layer integration test passes successfully._

To run the complete test suite:

```bash
npm test
```

_Expected Output: All 118 tests pass successfully._

### Step 3: Code Walkthrough

Show the following files during the walkthrough:

1. **[dry_run_trust_layer.js](file:///d:/VS%20Code/Placemux/scripts/dry_run_trust_layer.js)**: Explain how the mock database and Razorpay prototype overrides allow a robust, network-independent local dry run.
2. **[trust-layer-dry-run.test.js](file:///d:/VS%20Code/Placemux/tests/trust-layer-dry-run.test.js)**: Show the Vitest assertions verifying each step of the pipeline.
3. **[offer.service.js](file:///d:/VS%20Code/Placemux/src/modules/offers/offer.service.js#L254)**: Walk through the `verifyOffer` method, pointing out how the HMAC is recomputed and compared against the stored signature hash to identify database changes.

---

## 🏁 Conclusion

> "With Task 15 complete, the backend trust layer is stabilized, verified end-to-end, and ready for production hand-off."
