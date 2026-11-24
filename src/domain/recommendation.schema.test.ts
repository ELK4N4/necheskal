import { describe, expect, it } from "vitest";
import { RecommendationSchema } from "./recommendation.schema";

describe("RecommendationSchema", () => {
  it("accepts each of the allowed model-selected labels", () => {
    for (const label of ["לא לאשר", "מוכן לאישור", "נדרש בירור"] as const) {
      expect(RecommendationSchema.safeParse({
        label,
        summary: "ההמלצה מבוססת על הממצאים.",
        strengths: [],
        weaknesses: [],
      }).success).toBe(true);
    }
  });

  it("rejects a label outside the model-facing enum", () => {
    expect(RecommendationSchema.safeParse({
      label: "לא בטוח",
      summary: "נדרש לבדוק.",
      strengths: [],
      weaknesses: [],
    }).success).toBe(false);
  });

  it("allows the model-selected recommendation to include the broker's city explanation", () => {
    const result = RecommendationSchema.safeParse({
      label: "נדרש בירור",
      summary: "הנכס ברמת גן ולא בפתח תקווה, אך המתווך מסביר שהוא סמוך לפתח תקווה ולכן המחיר נמוך; יש לבדוק אם הפשרה מתאימה.",
      strengths: [],
      weaknesses: [{
        text: "העיר שונה מהבקשה, עם הסבר של המתווך לגבי הקרבה והמחיר.",
        evidence: "הדירה ברמת גן ולא בפתח תקווה כמו שביקשתם אבל זה על גבול פתח תקווה ובגלל זה המחיר נמוך",
      }],
    });

    expect(result.success).toBe(true);
  });

  it("allows a clarification recommendation without evaluating whether the broker claim is persuasive", () => {
    const result = RecommendationSchema.safeParse({
      label: "נדרש בירור",
      summary: "העיר שונה מהבקשה; המתווך טוען שהנכס סמוך לפתח תקווה והמחיר נמוך בשל כך. נדרש בירור מול המנהל.",
      strengths: [],
      weaknesses: [{
        text: "טענת המתווך דורשת בדיקה.",
        evidence: "זה על גבול פתח תקווה ובגלל זה המחיר נמוך",
      }],
    });
    expect(result.success).toBe(true);
  });
});
