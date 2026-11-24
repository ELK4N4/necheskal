import { describe, expect, it } from "vitest";
import {
  normalizeRequirementField,
  normalizeRequirementsExtraction,
  RequirementsExtractionSchema,
} from "./requirement.schema";
import type { ProposalField } from "./proposal.schema";
import { evaluateProposalAgainstRequirements } from "./evaluateProposalAgainstRequirements";

describe("requirement field normalization", () => {
  it.each([
    ["number_of_rooms", "rooms"],
    ["asking_price", "price"],
    ["max_price", "price"],
    ["budget", "price"],
    ["available_from", "availableFrom"],
    ["parking", "parking"],
  ])("normalizes %s to its canonical field", (input, expected) => {
    expect(normalizeRequirementField(input)).toBe(expected);
  });

  it("does not accept an unknown field as a structured requirement", () => {
    const result = RequirementsExtractionSchema.safeParse({
      requirements: [{
        field: "invented_field",
        operator: "eq",
        value: true,
        importance: "must",
        evidenceQuote: "דוגמה",
      }],
      unparsedRequests: [],
    });

    expect(result.success).toBe(false);
  });

  it.each([
    ["available_from", "15 בינואר 2027", "2027-01-15"],
  ])("normalizes natural-language values for %s", (field, value, expected) => {
    const result = normalizeRequirementsExtraction({
      requirements: [{
        field,
        operator: "eq",
        value,
        importance: "must",
        evidenceQuote: "דרישה",
      }],
      unparsedRequests: [],
    });

    expect(result.requirements[0]).toMatchObject({ value: expected });
  });

  it("matches canonicalized requirements against the broker proposal", () => {
    const extracted = normalizeRequirementsExtraction({
      requirements: [
        {
          field: "number_of_rooms",
          operator: "gte",
          value: 4,
          importance: "must",
          evidenceQuote: "לפחות 4 חדרים",
        },
        {
          field: "price",
          operator: "lte",
          value: 3_000_000,
          importance: "must",
          evidenceQuote: "עד התקציב",
        },
      ],
      unparsedRequests: [],
    });
    const proposal: ProposalField[] = [
      { field: "rooms", value: 4, quote: "4 חדרים" },
      { field: "price", value: 2_891_000, quote: "מחיר: 2,891,000 ₪" },
    ];

    expect(evaluateProposalAgainstRequirements(proposal, extracted.requirements)).toMatchObject([
      { field: "rooms", status: "match", proposalValue: 4 },
      { field: "price", status: "match", proposalValue: 2_891_000 },
    ]);
  });
});
