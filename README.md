# PlaceMux Marketplace API

JavaScript backend foundation for company onboarding, marketplace ownership, company
profiles, and the first KYC submission flow.

## What is included

- MongoDB marketplace schema with Prisma-managed indexes
- Atomic company signup (user + company + owner membership + profile + KYC)
- JWT login and protected company endpoints
- Company profile editing with owner/admin authorization
- KYC document metadata submission and lifecycle states
- Duplicate email, registration number, and GSTIN protection
- Consistent validation and error responses
- MongoDB Atlas setup guidance and automated tests

KYC files are deliberately not stored in MongoDB. The API accepts a
`storageKey` after a file has been placed in private object storage.

## Run locally

Requirements: Node.js 20+, npm, and a MongoDB Atlas database.

```bash
copy .env.example .env
npm install
npm run prisma:generate
npm run db:push
npm run dev
```

Edit `.env` before running the database commands. Use a connection string with
an explicit database name:

```env
DATABASE_URL=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/placemux?retryWrites=true&w=majority&appName=APP_NAME
```

In MongoDB Atlas, allow the development machine's current IP address under
Network Access and grant the database user read/write permission.

The API runs at `http://localhost:3000`.

## Demo flow

### 1. Create a company and its owner

```bash
curl -X POST http://localhost:3000/api/v1/auth/companies/signup \
  -H "Content-Type: application/json" \
  -d '{
    "owner": {
      "name": "Aarav Sharma",
      "email": "aarav@example.com",
      "password": "SecurePass123",
      "phone": "+919876543210"
    },
    "company": {
      "legalName": "Acme Spaces Private Limited",
      "displayName": "Acme Spaces",
      "companyType": "PRIVATE_LIMITED",
      "registrationNumber": "U12345MH2025PTC123456",
      "gstin": "27ABCDE1234F1Z5"
    }
  }'
```

Save `data.accessToken` and `data.company.id` from the response.

### 2. Complete the company profile

```bash
curl -X PATCH http://localhost:3000/api/v1/companies/COMPANY_ID/profile \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Flexible workplaces for growing teams.",
    "website": "https://example.com",
    "addressLine1": "12 Market Road",
    "city": "Mumbai",
    "state": "Maharashtra",
    "postalCode": "400001"
  }'
```

### 3. Retrieve the company

```bash
curl http://localhost:3000/api/v1/companies/COMPANY_ID \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### 4. Start KYC

This endpoint records metadata for files already uploaded to private storage.

```bash
curl -X POST http://localhost:3000/api/v1/companies/COMPANY_ID/kyc \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "type": "CERTIFICATE_OF_INCORPORATION",
        "storageKey": "kyc/COMPANY_ID/incorporation.pdf",
        "fileName": "incorporation.pdf",
        "mimeType": "application/pdf"
      },
      {
        "type": "PAN_CARD",
        "storageKey": "kyc/COMPANY_ID/pan.pdf",
        "fileName": "pan.pdf",
        "mimeType": "application/pdf"
      }
    ]
  }'
```

The company becomes `PENDING_KYC` and the KYC record becomes `PENDING`.
Verification/rejection is intentionally an internal admin concern for the next
phase.

## API routes

| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Service health |
| `POST` | `/api/v1/auth/companies/signup` | No | Atomic owner/company signup |
| `POST` | `/api/v1/auth/login` | No | Get a fresh JWT |
| `GET` | `/api/v1/companies/:id` | Member | Read company and onboarding state |
| `PATCH` | `/api/v1/companies/:id/profile` | Owner/Admin | Update marketplace profile |
| `POST` | `/api/v1/companies/:id/kyc` | Owner/Admin | Submit KYC metadata |

## Verification

```bash
npm run build
npm test
npm run lint
```

To inspect the synchronized collections:

```bash
npm run db:studio
```

## Important boundaries

- The signup transaction prevents partially-created companies.
- Passwords are hashed with bcrypt and never returned.
- Protected reads intentionally return `404` to non-members, preventing company
  enumeration.
- Only owners and admins can edit profiles or submit KYC.
- This phase does not process payments, perform external KYC verification, or
  upload files. Those systems can safely reference the stable company ObjectIds
  introduced here.
