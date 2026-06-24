# Task 10 — Monetization Integration & Revenue Dashboard

## Overview

Stabilizes backend payments end-to-end and implements a comprehensive Revenue Dashboard/Analytics API endpoint (`GET /api/v1/payments/dashboard`) allowing the founder and company members (owners/admins/members) to monitor platform-wide and company-specific monetization performance. The dashboard calculates summary metrics (gross revenue, refunded amounts, net revenue, transaction counts by state), break downs revenue per job post, and generates contiguous historical trends (complete with zero-filled records for quiet days).

---

## Modified Files

| File | Change |
| --- | --- |
| `src/modules/payments/payment.schemas.js` | Defined and registered `dashboardQuerySchema` for validating dashboard query filters (`companyId`, `startDate`, `endDate`). |
| `src/modules/payments/payment.service.js` | Implemented the core business logic `getRevenueDashboard` that validates company memberships, aggregates payment statuses/amounts, maps revenue breakdowns per job, and generates day-by-day contiguous timelines of revenue activity. |
| `src/modules/payments/payment.routes.js` | Registered the `GET /dashboard` endpoint, positioning it before parameterized ID routes to avoid routing/matching conflicts. |
| `tests/payment.test.js` | Appended 4 integration test cases covering platform-wide dashboard calculation, company-specific access controls, validation checks, and date range filters. |

---

## API Endpoints

### 📊 1. Revenue Dashboard / Analytics
#### `GET /api/v1/payments/dashboard`

Retrieves a detailed aggregation of payments data for monetization audits.

- **Query Parameters**:
  - `companyId` (optional, MongoDB ObjectId): Filters statistics for a specific company's jobs. Enforces company membership verification (OWNER, ADMIN, MEMBER).
  - `startDate` (optional, `YYYY-MM-DD`): Lower boundary for transaction date range filtering.
  - `endDate` (optional, `YYYY-MM-DD`): Upper boundary for transaction date range filtering.

- **Authentication**: JWT access token required (passed in the `Authorization: Bearer <token>` header).

**Response (200 OK):**
```json
{
  "data": {
    "summary": {
      "totalRevenue": 10000,
      "totalRefunded": 0,
      "netRevenue": 10000,
      "totalTransactions": 1,
      "completedCount": 1,
      "refundedCount": 0,
      "failedCount": 0,
      "pendingCount": 0
    },
    "jobBreakdown": [
      {
        "jobId": "685400000000000000000003",
        "title": "React Developer",
        "companyName": "Acme Corp",
        "totalRevenue": 10000,
        "totalRefunded": 0,
        "netRevenue": 10000,
        "applicationCount": 1
      }
    ],
    "dailyTrends": [
      {
        "date": "2026-06-01",
        "revenue": 10000,
        "refunds": 0,
        "netRevenue": 10000,
        "transactionCount": 1
      },
      {
        "date": "2026-06-02",
        "revenue": 0,
        "refunds": 0,
        "netRevenue": 0,
        "transactionCount": 0
      }
    ]
  }
}
```

---

## Running Tests

To verify that the dashboard analytics and validation logic runs perfectly:

```bash
npx vitest run --sequence.concurrent=false --maxWorkers=1
```

All 85 tests covering checkout flows, verification checkpoints, webhooks, auto-refunds, reconciliation, and the revenue dashboard will run and pass successfully.
