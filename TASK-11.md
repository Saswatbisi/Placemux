# Task 11 — Offer Generation & E-Sign Design

## Overview

Exposes secure endpoints and designs a relational offer data model to handle candidate employment offers. Integrates secure eSign selection (in-house cryptographic validation and simulated third-party provider transaction ledger tracking) to verify offer acceptance status, candidate identity, and guarantee tamper-evident database verification.

---

## Modified/Created Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | Extended the schema with `OfferStatus` enum, `Offer` model (fields for compensation, eSign approach, IP, provider transaction ID, signature hash), and one-to-one relation with `Application`. |
| `src/config.js` | Defined `OFFER_SIGNING_SECRET` configuration with a default testing secret. |
| `src/app.js` | Registered `offerRoutes(db)` under the `/api/v1` prefix. |
| `src/modules/offers/offer.schemas.js` | Created input schemas for creating offers, signing offers, and validating ID parameters. |
| `src/modules/offers/offer.service.js` | Implemented business rules: `createOffer` (creates pending offer, verifies company membership role), `getOffer` (access restriction to applicant and company members), `signOffer` (handles `CRYPTOGRAPHIC` HMAC hashing or `THIRD_PARTY` ledger updates), and `verifyOffer` (re-hashes and detects database tampering). |
| `src/modules/offers/offer.routes.js` | Defined route handlers for creation, fetching, signing, and verification. |
| `tests/offer.test.js` | Created 9 integration test cases testing happy path creation, duplicate checks, signing approaches, suspended company block rules, and database tamper detection simulations. |

---

## API Endpoints

### 📝 1. Generate Application Job Offer
#### `POST /api/v1/companies/:companyId/applications/:applicationId/offers`
Creates a pending offer with compensation details.
- **Rules**: Caller must be company OWNER or ADMIN. Only one offer can exist per application. Start date must be in the future.
- **Request Body**:
```json
{
  "salary": 800000,
  "startDate": "2026-07-01T09:00:00.000Z",
  "probationPeriod": 3
}
```

---

### 📬 2. Fetch Offer Details
#### `GET /api/v1/offers/:id`
Retrieves job offer details.
- **Rules**: Must belong to the calling applicant OR a member of the company that issued it.

---

### 🖋️ 3. Accept & eSign Offer
#### `POST /api/v1/offers/:id/sign`
Selects the eSign approach and signs the offer.
- **Rules**: Can only be signed by the corresponding applicant candidate when company status is ACTIVE and offer status is PENDING.
- **Approach options**:
  1. `CRYPTOGRAPHIC`: candidate provides a text signature name. The backend signs the core offer terms + signature using `OFFER_SIGNING_SECRET` and stores the signature hash.
  2. `THIRD_PARTY`: backend simulates third-party session creation and records provider transaction ID.

- **Request Body (Cryptographic)**:
```json
{
  "esignApproach": "CRYPTOGRAPHIC",
  "signature": "Aarav Sharma"
}
```

- **Request Body (Third-Party)**:
```json
{
  "esignApproach": "THIRD_PARTY"
}
```

---

### 🔍 4. Verify Signature & Integrity
#### `GET /api/v1/offers/:id/verify`
Performs an authenticity check.
- **Rules**: Open to candidate or company. Re-computes the cryptographic HMAC of the database fields and matches it with the stored signature hash. If database records (like salary or start date) have been quietly tampered with or modified by a bad actor, the validation fails and signals database tampering.

---

## Running Tests

To run the complete offers test suite:

```bash
npx vitest run tests/offer.test.js
```

All 9 tests covering creation, authorization boundaries, signing modes, and tamper detection will run and pass successfully.
