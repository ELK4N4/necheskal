import { describe, expect, it } from "vitest";
import { normalizeProposalExtraction, ProposalExtractionResponseSchema, ProposalExtractionSchema } from "./proposal.schema";

describe("proposal schemas", () => {
  it("accepts a model-facing proposal extraction response", () => {
    expect(ProposalExtractionResponseSchema.safeParse({
      proposalCount: 1, readable: true, propertyId: "DEMO-001", propertyIdQuote: "DEMO-001", fields: [], unverifiedClaims: [],
    }).success).toBe(true);
  });

  it("validates ISO dates after normalization", () => {
    expect(ProposalExtractionSchema.safeParse({
      proposalCount: 1,
      readable: true,
      propertyId: "DEMO-001",
      propertyIdQuote: "DEMO-001",
      unverifiedClaims: [],
      fields: [{ field: "availableFrom", value: "2027-01-01", quote: "01/01/2027" }],
    }).success).toBe(true);
  });

  it("normalizes Hebrew month names in broker availability dates", () => {
    for (const [value, quote] of [
      ["15 בינואר 2027", "מ־15 בינואר 2027"],
      ["15 בינואר 2027", "מ-15 בינואר 2027"],
      ["מ־15 בינואר 2027", "מ־15 בינואר 2027"],
    ]) {
      const parsed = normalizeProposalExtraction({
        proposalCount: 1,
        readable: true,
        propertyId: "DEMO-002",
        propertyIdQuote: "DEMO-002",
        unverifiedClaims: [],
        fields: [{ field: "availableFrom", value, quote }],
      });
      expect(parsed.fields[0]?.value).toBe("2027-01-15");
    }
  });

  it("recovers an availability date from the exact quote if the model leaves its value unnormalized", () => {
    const parsed = normalizeProposalExtraction({
      proposalCount: 1,
      readable: true,
      propertyId: "DEMO-002",
      propertyIdQuote: "DEMO-002",
      unverifiedClaims: [],
      fields: [{ field: "availableFrom", value: "15 בינואר 2027", quote: "זמינות מ־15 בינואר 2027" }],
    });

    expect(parsed.fields[0]).toEqual({
      field: "availableFrom",
      value: "2027-01-15",
      quote: "זמינות מ־15 בינואר 2027",
    });
  });

  it("normalizes a formatted asking price before validating its property type", () => {
    const parsed = normalizeProposalExtraction({
      proposalCount: 1,
      readable: true,
      propertyId: "DEMO-001",
      propertyIdQuote: "DEMO-001",
      unverifiedClaims: [],
      fields: [{ field: "price", value: "3,250,000 ₪", quote: "3,250,000 ₪" }],
    });

    expect(parsed.fields[0]?.value).toBe(3250000);
  });

  it("normalizes textual values that represent numbers", () => {
    const parsed = normalizeProposalExtraction({
      proposalCount: 1,
      readable: true,
      propertyId: "DEMO-001",
      propertyIdQuote: "DEMO-001",
      unverifiedClaims: [],
      fields: [{ field: "rooms", value: "3.5", quote: "3.5 חדרים" }],
    });

    expect(parsed.fields[0]?.value).toBe(3.5);
  });

  it("ignores null or empty placeholder fields returned by the model", () => {
    const parsed = ProposalExtractionResponseSchema.parse({
      proposalCount: 1,
      readable: true,
      propertyId: "DEMO-002",
      propertyIdQuote: "DEMO-002",
      unverifiedClaims: [],
      fields: [
        { field: "rooms", value: null, quote: "" },
        { field: "areaSqm", value: 96, quote: "96 מ״ר" },
      ],
    });

    expect(parsed.fields).toEqual([
      { field: "areaSqm", value: 96, quote: "96 מ״ר" },
    ]);
  });

  it("normalizes harmless formatting differences in property IDs", () => {
    const parsed = normalizeProposalExtraction({
      proposalCount: 1,
      readable: true,
      propertyId: "demo 001",
      propertyIdQuote: "demo 001",
      unverifiedClaims: [],
      fields: [],
    });

    expect(parsed.propertyId).toBe("DEMO-001");
  });

  it("does not accept unrecognized proposal fields", () => {
    expect(ProposalExtractionSchema.safeParse({
      proposalCount: 1,
      readable: true,
      propertyId: "DEMO-001",
      propertyIdQuote: "DEMO-001",
      unverifiedClaims: [],
      fields: [{ field: "balcony", value: true, quote: "יש מרפסת גדולה" }],
    }).success).toBe(false);
  });

  it("retains factual broker claims that cannot be checked against the property schema", () => {
    const parsed = normalizeProposalExtraction({
      proposalCount: 1,
      readable: true,
      propertyId: "DEMO-002",
      propertyIdQuote: "DEMO-002",
      fields: [],
      unverifiedClaims: [{ claim: "הבניין נבנה בשנת 2019 על ידי אשטרום", quote: "הבניין נבנה בשנת 2019 על ידי אשטרום." }],
    });

    expect(parsed.unverifiedClaims).toEqual([
      { claim: "הבניין נבנה בשנת 2019 על ידי אשטרום", quote: "הבניין נבנה בשנת 2019 על ידי אשטרום." },
    ]);
  });

  it("does not allow the model to add an unsupported field to an unverified claim", () => {
    const parsed = normalizeProposalExtraction({
      proposalCount: 1,
      readable: true,
      propertyId: "DEMO-002",
      propertyIdQuote: "DEMO-002",
      fields: [],
      unverifiedClaims: [{
        claim: "הנכס סמוך לפתח תקווה ולכן המחיר נמוך",
        quote: "זה על גבול פתח תקווה ובגלל זה המחיר נמוך",
      }],
    });

    expect(parsed.unverifiedClaims[0]?.claim).toContain("המחיר נמוך");
  });
});
