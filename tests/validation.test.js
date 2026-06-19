import { describe, expect, it } from "vitest";
import {
  companySignupSchema,
  loginSchema,
} from "../src/modules/auth/auth.schemas.js";
import {
  submitKycSchema,
  updateProfileSchema,
} from "../src/modules/companies/company.schemas.js";

const validSignup = {
  owner: {
    name: "Aarav Sharma",
    email: "Aarav@Example.com",
    password: "SecurePass123",
    phone: "+919876543210",
  },
  company: {
    legalName: "Acme Spaces Private Limited",
    displayName: "Acme Spaces",
    companyType: "PRIVATE_LIMITED",
    registrationNumber: "U12345MH2025PTC123456",
    gstin: "27ABCDE1234F1Z5",
  },
};

describe("company signup validation", () => {
  it("accepts a valid Indian company signup", () => {
    const result = companySignupSchema.safeParse(validSignup);
    expect(result.success).toBe(true);
  });

  it("rejects malformed GSTIN values", () => {
    const result = companySignupSchema.safeParse({
      ...validSignup,
      company: { ...validSignup.company, gstin: "BAD-GSTIN" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects weak passwords", () => {
    const result = companySignupSchema.safeParse({
      ...validSignup,
      owner: { ...validSignup.owner, password: "password" },
    });
    expect(result.success).toBe(false);
  });
});

describe("profile and KYC validation", () => {
  it("requires at least one profile field", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("rejects duplicate KYC document types", () => {
    const document = {
      type: "PAN_CARD",
      storageKey: "kyc/company/pan.pdf",
      fileName: "pan.pdf",
      mimeType: "application/pdf",
    };
    expect(
      submitKycSchema.safeParse({ documents: [document, document] }).success,
    ).toBe(false);
  });

  it("validates login input", () => {
    expect(
      loginSchema.safeParse({
        email: "owner@example.com",
        password: "anything",
      }).success,
    ).toBe(true);
  });
});
