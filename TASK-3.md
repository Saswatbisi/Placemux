# Task 3 — Search & Discovery

## Overview

Exposes public search and discovery APIs that allow job seekers to find, filter, and explore published job listings without authentication.

---

## New Files

| File                                   | Purpose                                                               |
| -------------------------------------- | --------------------------------------------------------------------- |
| `src/modules/search/search.schemas.js` | Zod validation schemas for search/discovery query parameters          |
| `src/modules/search/search.service.js` | Search service with keyword search, filtering, ranking, and discovery |
| `src/modules/search/search.routes.js`  | Fastify route definitions for all search & discovery endpoints        |
| `tests/search.validation.test.js`      | Unit tests for search query schemas                                   |
| `tests/search.test.js`                 | Integration tests for all search & discovery endpoints                |

## Modified Files

| File         | Change                                           |
| ------------ | ------------------------------------------------ |
| `src/app.js` | Registered `searchRoutes` under `/api/v1` prefix |

---

## API Endpoints

All endpoints are **public** (no authentication required).

### 🔍 Search

#### `GET /api/v1/search/jobs`

Full-text keyword search with multi-facet filtering, sorting, and cursor-based pagination.

**Query Parameters:**

| Param            | Type     | Default     | Description                                                |
| ---------------- | -------- | ----------- | ---------------------------------------------------------- |
| `q`              | string   | —           | Keyword search (matches title, description, location)      |
| `employmentType` | string   | —           | Comma-separated: `FULL_TIME,PART_TIME,CONTRACT,INTERNSHIP` |
| `workplaceType`  | string   | —           | Comma-separated: `ONSITE,HYBRID,REMOTE`                    |
| `status`         | string   | `PUBLISHED` | `PUBLISHED` or `CLOSED`                                    |
| `location`       | string   | —           | Case-insensitive location filter                           |
| `skills`         | string   | —           | Comma-separated skill keys (auto-lowercased)               |
| `companyId`      | ObjectId | —           | Filter by company                                          |
| `sortBy`         | string   | `relevance` | `relevance`, `createdAt`, or `title`                       |
| `sortOrder`      | string   | `desc`      | `asc` or `desc`                                            |
| `cursor`         | ObjectId | —           | Cursor for pagination                                      |
| `limit`          | number   | `20`        | 1–50                                                       |

**Example:**

```
GET /api/v1/search/jobs?q=React&employmentType=FULL_TIME,INTERNSHIP&workplaceType=REMOTE&skills=react,typescript&sortBy=relevance&limit=10
```

**Response:**

```json
{
  "data": {
    "items": [
      {
        "id": "...",
        "title": "Senior React Developer",
        "description": "...",
        "location": "Bengaluru",
        "employmentType": "FULL_TIME",
        "workplaceType": "HYBRID",
        "status": "PUBLISHED",
        "assessmentUrl": "http://localhost:3000/api/v1/assessments/...",
        "company": {
          "id": "...",
          "displayName": "Acme Corp",
          "profile": {
            "logoUrl": null,
            "city": "Bengaluru",
            "state": "Karnataka"
          }
        },
        "skillThresholds": [
          { "id": "...", "skill": "React", "minimumLevel": 70 }
        ],
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "pagination": {
      "limit": 10,
      "hasNextPage": true,
      "nextCursor": "507f1f77bcf86cd799439033",
      "total": 10
    }
  }
}
```

---

#### `GET /api/v1/search/jobs/:jobId`

Retrieve a single published job by ID.

**Response:** `{ "data": { ...job } }` or `404` if not found / not published.

---

### 🧭 Discovery

#### `GET /api/v1/discover/recent`

Latest published jobs (default 10).

| Param    | Type     | Default | Description           |
| -------- | -------- | ------- | --------------------- |
| `limit`  | number   | `10`    | 1–50                  |
| `cursor` | ObjectId | —       | Cursor for pagination |

---

#### `GET /api/v1/discover/skills`

Top skills across all published jobs, sorted by frequency.

| Param   | Type   | Default | Description |
| ------- | ------ | ------- | ----------- |
| `limit` | number | `25`    | 1–100       |

**Response:**

```json
{
  "data": {
    "items": [
      { "skill": "React", "skillKey": "react", "count": 15 },
      { "skill": "Node.js", "skillKey": "node.js", "count": 12 }
    ],
    "total": 42
  }
}
```

---

#### `GET /api/v1/discover/locations`

Top hiring locations, sorted by job count.

| Param   | Type   | Default | Description |
| ------- | ------ | ------- | ----------- |
| `limit` | number | `25`    | 1–100       |

**Response:**

```json
{
  "data": {
    "items": [
      { "location": "Bengaluru", "count": 25 },
      { "location": "Mumbai", "count": 18 }
    ],
    "total": 15
  }
}
```

---

#### `GET /api/v1/discover/employment-types`

Employment type breakdown with counts.

**Response:**

```json
{
  "data": {
    "items": [
      { "type": "FULL_TIME", "count": 30 },
      { "type": "INTERNSHIP", "count": 12 }
    ],
    "total": 4
  }
}
```

---

## Relevance Ranking Algorithm

When `sortBy=relevance` and a keyword `q` is provided, jobs are ranked in-app using a weighted scoring system:

| Field                      | Points per keyword hit |
| -------------------------- | ---------------------- |
| **Title**                  | +3                     |
| **Location**               | +2                     |
| **Description**            | +1                     |
| **Recency** (≤ 7 days old) | +1 bonus               |

Jobs are sorted by total score descending.

---

## Running Tests

```bash
npm test
```

Tests cover:

- Schema validation (defaults, parsing, rejection of invalid input)
- Search endpoint with keyword ranking verification
- Filter passthrough to Prisma
- Skill-based filtering
- Validation error responses (400)
- Single job lookup and 404 handling
- All four discovery endpoints
