import { describe, expect, it } from "vitest";
import {
  allowedRecommendationLabels,
  deriveRecommendationLabel,
  type RecommendationFacts,
} from "./recommendation.schema";

describe("recommendation decision rules", () => {
  it("rejects approval when there is a database mismatch", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [{ field: "city", status: "mismatch", proposalValue: "ירושלים", databaseValue: "רמת גן" }],
      requirementComparisons: [{ field: "city", status: "match", importance: "must" }],
      unparsedRequests: [],
    };

    expect(allowedRecommendationLabels(facts)).toEqual(new Set(["לא לאשר"]));
    expect(deriveRecommendationLabel(facts)).toBe("לא לאשר");
  });

  it("requires clarification for any missing proposal field", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [{ field: "availableFrom", status: "missing", proposalValue: null, databaseValue: "2027-01-15" }],
      requirementComparisons: [],
      unparsedRequests: [],
    };

    expect(allowedRecommendationLabels(facts)).toEqual(new Set(["נדרש בירור"]));
    expect(deriveRecommendationLabel(facts)).toBe("נדרש בירור");
  });

  it("requires clarification when the broker explains a database mismatch on the same field", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [{ field: "city", status: "mismatch", proposalValue: "רמת גן", databaseValue: "ירושלים" }],
      requirementComparisons: [{ field: "city", status: "mismatch", importance: "must", brokerExplanation: "המתווך מסביר שהדירה סמוכה לירושלים" }],
      unparsedRequests: [],
    };

    expect(allowedRecommendationLabels(facts)).toEqual(new Set(["נדרש בירור"]));
    expect(deriveRecommendationLabel(facts)).toBe("נדרש בירור");
  });

  it("rejects approval for a database mismatch even when other required information is missing", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [
        { field: "city", status: "mismatch", proposalValue: "באר שבע", databaseValue: "חולון" },
        { field: "price", status: "mismatch", proposalValue: 1_400_000, databaseValue: 2_140_000 },
      ],
      requirementComparisons: [
        { field: "city", status: "mismatch", importance: "must" },
        { field: "parking", status: "missing", importance: "must" },
        { field: "availableFrom", status: "missing", importance: "must" },
      ],
      unparsedRequests: [],
    };

    expect(allowedRecommendationLabels(facts)).toEqual(new Set(["לא לאשר"]));
    expect(deriveRecommendationLabel(facts)).toBe("לא לאשר");
  });

  it("does not treat a generic unrelated broker claim as an explanation for a database mismatch", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [
        { field: "city", status: "mismatch", proposalValue: "באר שבע", databaseValue: "חולון" },
        { field: "price", status: "mismatch", proposalValue: 1_400_000, databaseValue: 2_140_000 },
      ],
      requirementComparisons: [{ field: "availableFrom", status: "missing", importance: "must" }],
      unparsedRequests: [],
      unverifiedClaims: [{ claim: "הדירה משופצת" }],
    };

    expect(deriveRecommendationLabel(facts)).toBe("לא לאשר");
  });

  it("requires clarification when a broker claim is explicitly linked to the mismatched field", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [{ field: "city", status: "mismatch", proposalValue: "רמת גן", databaseValue: "ירושלים" }],
      requirementComparisons: [],
      unparsedRequests: [],
      unverifiedClaims: [{ field: "city", claim: "הדירה ברמת גן, סמוך לירושלים" }],
    };

    expect(deriveRecommendationLabel(facts)).toBe("נדרש בירור");
  });

  it("does not use unrelated unverified claims as explanations for a mismatch", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [{ field: "city", status: "mismatch", proposalValue: "רמת גן", databaseValue: "פתח תקווה" }],
      requirementComparisons: [{ field: "city", status: "mismatch", importance: "preference" }],
      unparsedRequests: [],
      unverifiedClaims: [{ field: "price", claim: "הדירה קרובה מאוד למקום המבוקש" }],
    };

    expect(deriveRecommendationLabel(facts)).toBe("לא לאשר");
  });

  it("does not allow an explained preference to excuse another unexplained database mismatch", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [
        { field: "city", status: "mismatch", proposalValue: "רמת גן", databaseValue: "ירושלים" },
        { field: "price", status: "mismatch", proposalValue: 2_890_000, databaseValue: 2_700_000 },
      ],
      requirementComparisons: [
        { field: "city", status: "mismatch", importance: "preference" },
      ],
      unparsedRequests: [],
      unverifiedClaims: [{ field: "city", claim: "הדירה ברמת גן, על גבול פתח תקווה, וקרובה מאוד למקום המבוקש" }],
    };

    expect(deriveRecommendationLabel(facts)).toBe("לא לאשר");
  });

  it("rejects approval when a must requirement is not met even without a database mismatch", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [],
      requirementComparisons: [{ field: "parking", status: "mismatch", importance: "must" }],
      unparsedRequests: [],
    };

    expect(allowedRecommendationLabels(facts)).toEqual(new Set(["לא לאשר"]));
    expect(deriveRecommendationLabel(facts)).toBe("לא לאשר");
  });

  it("requires clarification for a broker-explained mismatch while rejecting a separate unexplained mismatch", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [
        { field: "city", status: "mismatch", proposalValue: "רמת גן", databaseValue: "פתח תקווה" },
        { field: "price", status: "mismatch", proposalValue: 2_000_000, databaseValue: 2_500_000 },
      ],
      requirementComparisons: [],
      unparsedRequests: [],
      unverifiedClaims: [{ field: "city", claim: "הנכס סמוך לפתח תקווה" }],
    };

    expect(deriveRecommendationLabel(facts)).toBe("לא לאשר");
  });
});
