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

  it("allows clarification for a database mismatch when the broker explains that field's discrepancy", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [{ field: "city", status: "mismatch", proposalValue: "רמת גן", databaseValue: "ירושלים" }],
      requirementComparisons: [{ field: "city", status: "mismatch", importance: "preference", brokerExplanation: "המתווך מסביר שהדירה סמוכה לירושלים" }],
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

  it("allows clarification when an unverified broker claim explains the mismatched field", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [{ field: "city", status: "mismatch", proposalValue: "רמת גן", databaseValue: "ירושלים" }],
      requirementComparisons: [],
      unparsedRequests: [],
      unverifiedClaims: [{ claim: "הדירה ברמת גן, סמוך לירושלים" }],
    };

    expect(deriveRecommendationLabel(facts)).toBe("נדרש בירור");
  });

  it("allows clarification for a city preference explained as being near the requested city", () => {
    const facts: RecommendationFacts = {
      databaseComparisons: [{ field: "city", status: "mismatch", proposalValue: "רמת גן", databaseValue: "פתח תקווה" }],
      requirementComparisons: [{ field: "city", status: "mismatch", importance: "preference" }],
      unparsedRequests: [],
      unverifiedClaims: [{ claim: "זה על גבול פתח תקווה. זה קרוב מאוד לאיפה רציתם." }],
    };

    expect(deriveRecommendationLabel(facts)).toBe("נדרש בירור");
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
      unverifiedClaims: [{ claim: "הדירה ברמת גן, על גבול פתח תקווה, וקרובה מאוד למקום המבוקש" }],
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
});
