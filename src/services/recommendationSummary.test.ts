import { describe, expect, it } from "vitest";
import type { DatabaseComparison } from "../domain/compareProposalToDatabase";
import type { RequirementComparison } from "../domain/evaluateProposalAgainstRequirements";
import { buildRecommendationSummary } from "./analysisPipeline";

describe("buildRecommendationSummary", () => {
  it("explains the concrete reasons for not approving", () => {
    const databaseComparisons = [{
      field: "price",
      proposalValue: 2_000_000,
      databaseValue: 1_800_000,
      status: "mismatch",
      proposalQuote: "מחיר 2 מיליון",
    }] satisfies DatabaseComparison[];
    const requirementComparisons = [{
      field: "rooms",
      operator: "gte",
      requestedValue: 4,
      proposalValue: 3,
      importance: "must",
      status: "mismatch",
      proposalQuote: "3 חדרים",
      requestQuote: "לפחות 4 חדרים",
    }] satisfies RequirementComparison[];

    expect(buildRecommendationSummary("לא לאשר", databaseComparisons, requirementComparisons, 0, 0))
      .toBe("סתירות בין הצעת המתווך למאגר: מחיר (בהצעה: ‏2,000,000 ‏₪; במאגר: ‏1,800,000 ‏₪); דרישות חובה של הלקוח אינן מתקיימות לפי הצעת המתווך: מספר חדרים (בקשת הלקוח: 4; בהצעה: 3).");
  });

  it("explains that missing required information needs clarification", () => {
    const requirementComparisons = [{
      field: "parking",
      operator: "eq",
      requestedValue: true,
      proposalValue: null,
      importance: "must",
      status: "missing",
      proposalQuote: null,
      requestQuote: "חובה חניה",
    }] satisfies RequirementComparison[];

    expect(buildRecommendationSummary("נדרש בירור", [], requirementComparisons, 0, 0))
      .toBe("חסרה בדיקת חובה: חניה.");
  });

  it("explains a preference that is not met as a clarification item", () => {
    const requirementComparisons = [{
      field: "city",
      operator: "eq",
      requestedValue: "פתח תקווה",
      proposalValue: "רמת גן",
      importance: "preference",
      status: "mismatch",
      proposalQuote: "רמת גן",
      requestQuote: "מעדיפים בפתח תקווה",
    }] satisfies RequirementComparison[];

    expect(buildRecommendationSummary("נדרש בירור", [], requirementComparisons, 0, 0))
      .toBe("העדפת הלקוח אינה מתקיימת או לא נבדקה לפי הצעת המתווך: עיר (בקשת הלקוח: פתח תקווה; בהצעה: רמת גן).");
  });

  it("distinguishes broker-to-database and broker-to-client discrepancies with values", () => {
    const databaseComparisons = [
      { field: "price", proposalValue: 2_850_000, databaseValue: 3_250_000, status: "mismatch", proposalQuote: "2,850,000 ₪" },
      { field: "rooms", proposalValue: 4, databaseValue: 3, status: "mismatch", proposalQuote: "4 חדרים" },
      { field: "elevator", proposalValue: false, databaseValue: true, status: "mismatch", proposalQuote: "אין מעלית" },
      { field: "parking", proposalValue: false, databaseValue: false, status: "match", proposalQuote: "אין חניה" },
    ] satisfies DatabaseComparison[];
    const requirementComparisons = [
      { field: "city", operator: "eq", requestedValue: "תל אביב", proposalValue: "תל אביב", importance: "must", status: "match", proposalQuote: "תל אביב", requestQuote: "בתל אביב" },
      { field: "rooms", operator: "gte", requestedValue: 4, proposalValue: 4, importance: "must", status: "match", proposalQuote: "4 חדרים", requestQuote: "לפחות 4 חדרים" },
      { field: "price", operator: "lte", requestedValue: 3_000_000, proposalValue: 2_850_000, importance: "must", status: "match", proposalQuote: "2,850,000 ₪", requestQuote: "עד 3,000,000 ₪" },
      { field: "parking", operator: "eq", requestedValue: true, proposalValue: false, importance: "must", status: "mismatch", proposalQuote: "אין חניה", requestQuote: "חניה" },
      { field: "elevator", operator: "eq", requestedValue: true, proposalValue: false, importance: "must", status: "mismatch", proposalQuote: "אין מעלית", requestQuote: "מעלית" },
    ] satisfies RequirementComparison[];

    expect(buildRecommendationSummary("נדרש בירור", databaseComparisons, requirementComparisons, 0, 0))
      .toBe("סתירות בין הצעת המתווך למאגר: מחיר (בהצעה: ‏2,850,000 ‏₪; במאגר: ‏3,250,000 ‏₪), מספר חדרים (בהצעה: 4; במאגר: 3), מעלית (בהצעה: לא; במאגר: כן); דרישות חובה של הלקוח אינן מתקיימות לפי הצעת המתווך: חניה (בקשת הלקוח: כן; בהצעה: לא), מעלית (בקשת הלקוח: כן; בהצעה: לא).");
  });

  it("uses request and proposal facts to explain every discrepancy regardless of the model summary", () => {
    const databaseComparisons = [
      { field: "city", proposalValue: "ירושלים", databaseValue: "רמת גן", status: "mismatch", proposalQuote: "בירושלים" },
      { field: "price", proposalValue: 2_650_000, databaseValue: 2_890_000, status: "mismatch", proposalQuote: "2,650,000 ₪" },
      { field: "availableFrom", proposalValue: "2027-03-01", databaseValue: "2027-01-15", status: "mismatch", proposalQuote: "1 במרץ 2027" },
    ] satisfies DatabaseComparison[];
    const requirementComparisons = [
      { field: "city", operator: "eq", requestedValue: "ירושלים", proposalValue: "ירושלים", importance: "must", status: "match", proposalQuote: "בירושלים", requestQuote: "בירושלים" },
      { field: "price", operator: "lte", requestedValue: 2_700_000, proposalValue: 2_650_000, importance: "must", status: "match", proposalQuote: "2,650,000 ₪", requestQuote: "עד 2,700,000 ₪" },
      { field: "accessibility", operator: "eq", requestedValue: true, proposalValue: null, importance: "must", status: "missing", proposalQuote: null, requestQuote: "חובה שהדירה תהיה נגישה" },
    ] satisfies RequirementComparison[];

    expect(buildRecommendationSummary("נדרש בירור", databaseComparisons, requirementComparisons, 0, 0))
      .toBe("סתירות בין הצעת המתווך למאגר: עיר (בהצעה: ירושלים; במאגר: רמת גן), מחיר (בהצעה: ‏2,650,000 ‏₪; במאגר: ‏2,890,000 ‏₪), זמינות מתאריך (בהצעה: 2027-03-01; במאגר: 2027-01-15); חסרה בדיקת חובה: נגישות.");
  });

  it("does not include an unrelated unverified claim as if it explained a must mismatch", () => {
    const requirementComparisons = [{
      field: "city",
      operator: "eq",
      requestedValue: "פתח תקווה",
      proposalValue: "רמת גן",
      importance: "must",
      status: "mismatch",
      proposalQuote: "רמת גן",
      requestQuote: "פתח תקווה",
    }] satisfies RequirementComparison[];

    expect(buildRecommendationSummary("לא לאשר", [], requirementComparisons, 0, 1))
      .toBe("דרישות חובה של הלקוח אינן מתקיימות לפי הצעת המתווך: עיר (בקשת הלקוח: פתח תקווה; בהצעה: רמת גן); טענת מתווך לא אומתה.");
  });

  it("includes the actual unverified broker claim in the summary", () => {
    expect(buildRecommendationSummary("נדרש בירור", [], [], 0, 1, [{
      claim: "הנכס סמוך לפתח תקווה ולכן המחיר נמוך",
      quote: "זה על גבול פתח תקווה ובגלל זה המחיר נמוך",
    }]))
      .toBe("טענת מתווך לא אומתה: הנכס סמוך לפתח תקווה ולכן המחיר נמוך.");
  });

  it("keeps the explanation concise when several issues are present", () => {
    expect(buildRecommendationSummary("לא לאשר", [], [], 0, 1))
      .toBe("טענת מתווך לא אומתה.");
  });
});
