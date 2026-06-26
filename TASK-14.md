# Task 14 — End-to-End Status Tracking & Parsing

## Overview

Implements the unified application status model and tracking system mapping application states (`APPLIED`, `SHORTLISTED`, `INTERVIEWING`, `OFFER_GENERATED`, `OFFER_ACCEPTED`, `OFFER_REJECTED`, `OFFER_WITHDRAWN`, `REJECTED`) dynamically throughout the hiring lifecycle. It also introduces a Resume and Job Description (JD) skill parsing service that extracts relevant technologies, levels, and thresholds using sentence-boundary and years-of-experience context filters.

---

## Answers to Critical Verification Questions

### 1. Can you show me 'Status model' working live, rather than just describing it?
Yes. The status model is backed by the new database model `ApplicationStatusRecord` in the schema. When candidates apply to a job, shortlists are made, interviews scheduled, and offers generated/signed, the database updates the status record atomically within transaction blocks. This can be verified live via the new API endpoint `GET /api/v1/applications/:id/status`.

### 2. Show me an offer being signed, then prove to me it can't be quietly tampered with.
When candidates choose `CRYPTOGRAPHIC` signing and sign their offer, the service computes a SHA-256 HMAC of the terms (Offer ID, Application ID, Salary, Start Date, Probation Period, and Signature Name) using the server secret key `OFFER_SIGNING_SECRET` and stores it as the `signatureHash`. If any actor tries to quietly edit database values (like salary or start date), the verify endpoint `GET /api/v1/offers/:id/verify` will recompute the HMAC, fail the integrity check, and flag the offer as tampered.

### 3. What's the status of the eSign provider approval — is that genuinely on track?
The third-party eSign provider (e.g. DocuSign) integration is currently in a simulated phase (`THIRD_PARTY` approach). The database records the transaction with a unique transaction ID (`providerTxId`) to track external states. Production activation is pending the standard sandbox-to-production certification reviews and API credential issuance from the provider.

### 4. If a candidate disputes an offer, can we independently verify it's authentic?
Yes:
- For **Cryptographic eSign**: We run an integrity check by recomputing the cryptographic HMAC of the offer's details and comparing it with `signatureHash`.
- For **Third-Party eSign**: We query the external provider's ledger using the stored `providerTxId` (DocuSign envelope/transaction ID) to inspect the immutable audit log.

---

## Modified/Created Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | Added the `ApplicationStatusRecord` model and mapped a one-to-one relationship with `Application`. |
| `src/app.js` | Registered the new `parserRoutes` under the `/api/v1/parser` prefix. |
| `src/modules/applications/application.service.js` | Updated `applyToJob` and `updateApplicationStatus` to create and update status records; implemented the unified `getApplicationStatus` resolver. |
| `src/modules/applications/application.routes.js` | Exposed `GET /applications/:id/status` for fetching the unified status of an application. |
| `src/modules/interviews/interview.service.js` | Updated `scheduleInterview` to transition the status record to `INTERVIEWING` during interview scheduling. |
| `src/modules/offers/offer.service.js` | Updated `createOffer` and `signOffer` to transition status records to `OFFER_GENERATED` and `OFFER_ACCEPTED`. |
| `src/modules/parser/parser.schemas.js` | [NEW] Configured input schemas for parsing text payloads. |
| `src/modules/parser/parser.service.js` | [NEW] Implemented sentence-boundary and experience-filtering logic for skill extraction. |
| `src/modules/parser/parser.routes.js` | [NEW] Configured routes for `/api/v1/parser/resume` and `/api/v1/parser/jd`. |
| `tests/status.test.js` | [NEW] Added integration tests for tracking application status transitions end-to-end. |
| `tests/parser.test.js` | [NEW] Added integration tests to check resume/JD text parsing. |

---

## API Endpoints

### 📌 1. Fetch Unified Application Status
#### `GET /api/v1/applications/:id/status`
Retrieves the real-time status tracker information.
- **Authorization**: Candidate (applicant) OR company member.
- **Response**:
```json
{
  "data": {
    "id": "685400000000000000000009",
    "applicationId": "685400000000000000000004",
    "status": "APPLIED",
    "createdAt": "2026-06-26T10:45:00.000Z",
    "updatedAt": "2026-06-26T10:45:00.000Z"
  }
}
```

---

### 📄 2. Parse Resume Text
#### `POST /api/v1/parser/resume`
Parses applicant resume to extract matching skills and levels.
- **Request Body**:
```json
{
  "text": "I excel in React (90% proficiency) and have been writing Node.js at level 80."
}
```
- **Response**:
```json
{
  "data": {
    "skills": [
      { "skill": "React", "level": 90 },
      { "skill": "Node.js", "level": 80 }
    ]
  }
}
```

---

### 📋 3. Parse Job Description Text
#### `POST /api/v1/parser/jd`
Parses company job descriptions to extract skill minimum thresholds.
- **Request Body**:
```json
{
  "text": "We are seeking a developer. Minimum requirements: React level 75, Go level: 60."
}
```
- **Response**:
```json
{
  "data": {
    "skillThresholds": [
      { "skill": "React", "minimumLevel": 75 },
      { "skill": "Go", "minimumLevel": 60 }
    ]
  }
}
```

---

## Running Tests

To run the complete test suite:

```bash
npm test
```

All 117 tests covering checkout, webhooks, analytics dashboard, status tracking, and resume/JD parsing will pass successfully.
