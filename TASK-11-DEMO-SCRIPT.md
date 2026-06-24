# Task 11 — Offer Generation & E-Sign Design Demo Script

This script is structured to help you present and execute the demo of **Task 11: Offer Generation & E-Sign Design** to founders or team members. It is divided into a **Spoken Script** (what to say) and an **Execution Flow** (what commands to run).

---

## 🎙️ Spoken Presentation Script

### 1. Introduction
> "Hi everyone. Today, I'm presenting the implementation of **Task 11: Offer Generation & E-Sign Design**.
> Generating employment offer letters and signing them securely is a critical trust layer in the PlaceMux system. When money or contracts are involved, correctness and verification are key. This task introduces dynamic offer creation, candidate-facing eSign selection, and cryptographic tamper detection."

### 2. Key Architecture Features
> "We've added three primary components:
> 
> 1. **Offer Generation**: Company owners and admins can generate job offers containing CTC, start dates, and probation boundaries. We prevent duplicate offers and restrict access strictly to candidate owners or offering companies.
> 2. **E-Sign Selection**: Candidates can sign using one of two approaches:
>    - `CRYPTOGRAPHIC`: The backend computes a SHA-256 HMAC of core offer terms + the candidate's name signature, sealing the data using a secure server-side secret key.
>    - `THIRD_PARTY`: We simulate third-party document session creation (like DocuSign) and register the provider transaction ID in the database.
> 3. **Tamper-Evident Verification**: The `/verify` endpoint allows anyone to audit the integrity of the offer. If any bad actor alters database values (such as modifying salary terms), the recomputed hash mismatch will flag that the database has been tampered with."

### 3. Execution Verification
> "Let's run the test suite. We have added 9 comprehensive integration tests covering creations, roles, eSign options, suspension blocks, and database tamper detection simulations. All tests pass successfully."

---

## 🚀 Execution & Demo Flow

### Step 1: Run All Offer-related Tests
Verify test execution via vitest:
```bash
npx vitest run tests/offer.test.js
```
*Expected Output: 9 tests passed successfully.*

### Step 2: Code Walkthrough
Show the following files during the walkthrough:
1. **[schema.prisma](file:///d:/VS%20Code/Placemux/prisma/schema.prisma#L289)**: Show the `Offer` database model with fields for signatures, hashes, IPs, and dates.
2. **[offer.service.js (createOffer & signOffer)](file:///d:/VS%20Code/Placemux/src/modules/offers/offer.service.js#L52)**: Walk through creation permissions and eSign signing logic. Point out the SHA-256 HMAC hash generation.
3. **[offer.service.js (verifyOffer)](file:///d:/VS%20Code/Placemux/src/modules/offers/offer.service.js#L231)**: Walk through how we re-hash database details and detect tampering.
4. **[offer.test.js](file:///d:/VS%20Code/Placemux/tests/offer.test.js#L358)**: Show the DB tampering mock test case, demonstrating how validation fails when db fields are modified.

---

## 🏁 Conclusion
> "With Task 11 complete, we have successfully established a secure, audit-compliant contract trust layer for offers and e-signatures in our application."
