import { z } from "zod";

export const RecommendationLabelSchema = z.enum(["לא לאשר", "מוכן לאישור", "נדרש בירור"]);

export const RecommendationSchema = z.object({
  label: RecommendationLabelSchema,
  summary: z.string().min(1),
  strengths: z.array(z.object({ text: z.string().min(1), evidence: z.string().min(1) }).strict()),
  weaknesses: z.array(z.object({ text: z.string().min(1), evidence: z.string().min(1) }).strict()),
}).strict();

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type ValidatedRecommendation = Recommendation;

export type RecommendationFacts = {
  databaseComparisons: Array<{ field: string; status: string; proposalValue?: unknown; databaseValue?: unknown }>;
  requirementComparisons: Array<{ field: string; status: string; importance: string; brokerExplanation?: string }>;
  unparsedRequests: Array<unknown>;
  unverifiedClaims?: Array<{ field?: string | null; claim?: string; quote?: string }>;
};

export function allowedRecommendationLabels(facts: RecommendationFacts): Set<Recommendation["label"]> {
  return new Set([deriveRecommendationLabel(facts)]);
}

export function deriveRecommendationLabel(facts: RecommendationFacts): Recommendation["label"] {
  const hasUnexplainedDatabaseMismatch = facts.databaseComparisons.some(
    (item) => item.status === "mismatch" && !hasBrokerExplanationForField(facts, item.field),
  );
  const hasUnexplainedMustMismatch = facts.requirementComparisons.some(
    (item) => item.status === "mismatch"
      && item.importance === "must"
      && !item.brokerExplanation?.trim()
      && !hasBrokerExplanationForField(facts, item.field),
  );
  const hasUnexplainedPreferenceMismatch = facts.requirementComparisons.some(
    (item) => item.status === "mismatch"
      && item.importance === "preference"
      && !item.brokerExplanation?.trim()
      && !hasBrokerExplanationForField(facts, item.field),
  );
  if (hasUnexplainedDatabaseMismatch || hasUnexplainedMustMismatch || hasUnexplainedPreferenceMismatch) {
    return "לא לאשר";
  }

  const hasOpenIssue = facts.databaseComparisons.some((item) => item.status === "missing")
    || facts.requirementComparisons.some((item) =>
      item.status === "unknown"
      || (item.importance === "must" && item.status === "mismatch" && Boolean(item.brokerExplanation?.trim()))
      || (item.importance === "must" && item.status === "missing")
      || (item.importance === "preference" && (item.status === "missing" || item.status === "mismatch")),
    )
    || facts.unparsedRequests.length > 0
    || (facts.unverifiedClaims?.length ?? 0) > 0;
  if (hasOpenIssue) {
    return "נדרש בירור";
  }

  return "מוכן לאישור";
}

function hasBrokerExplanationForField(facts: RecommendationFacts, field: string): boolean {
  const requirementExplanation = facts.requirementComparisons.some(
    (item) => item.field === field && Boolean(item.brokerExplanation?.trim()),
  );
  const brokerClaim = facts.unverifiedClaims?.some((claim) => claim.field === field) ?? false;
  return requirementExplanation || brokerClaim;
}

export function validateRecommendationAgainstFacts(
  recommendation: Recommendation,
  facts: RecommendationFacts,
): boolean {
  return Boolean(recommendation.label && allowedRecommendationLabels(facts).has(recommendation.label));
}

export function getRecommendationValidationDetails(
  recommendation: Recommendation,
  facts: RecommendationFacts,
): string {
  const allowed = [...allowedRecommendationLabels(facts)];
  const reasons: string[] = [];
  const databaseMismatches = facts.databaseComparisons
    .filter((item) => item.status === "mismatch")
    .map((item) => item.field);
  const mustMismatches = facts.requirementComparisons
    .filter((item) => item.status === "mismatch" && item.importance === "must" && !item.brokerExplanation)
    .map((item) => item.field);
  const openMust = facts.requirementComparisons.filter(
    (item) => item.importance === "must" && item.status === "missing",
  ).map((item) => item.field);
  const explainedMustMismatches = facts.requirementComparisons
    .filter((item) => item.status === "mismatch" && item.importance === "must" && Boolean(item.brokerExplanation))
    .map((item) => item.field);
  const unknowns = facts.requirementComparisons
    .filter((item) => item.status === "unknown")
    .map((item) => item.field);
  const missingProposalFields = facts.databaseComparisons
    .filter((item) => item.status === "missing")
    .map((item) => item.field);

  const fieldList = (fields: string[]) => [...new Set(fields)].join(", ");
  if (databaseMismatches.length) reasons.push(`סתירה במאגר בשדות: ${fieldList(databaseMismatches)}`);
  if (mustMismatches.length) reasons.push(`דרישות חובה שלא מתקיימות: ${fieldList(mustMismatches)}`);
  else if (openMust.length) reasons.push(`דרישות חובה פתוחות: ${fieldList(openMust)}`);
  if (explainedMustMismatches.length) reasons.push(`דרישות חובה עם הסבר מתווך לבדיקה: ${fieldList(explainedMustMismatches)}`);
  if (unknowns.length) reasons.push(`נתונים לא מאומתים בשדות: ${fieldList(unknowns)}`);
  if (missingProposalFields.length) reasons.push(`פרטי הצעה חסרים בשדות: ${fieldList(missingProposalFields)}`);
  if (facts.unparsedRequests.length) reasons.push(`${facts.unparsedRequests.length} בקשות לא פוענחו`);
  if (facts.unverifiedClaims?.length) reasons.push(`${facts.unverifiedClaims.length} טענות מתווך לא אומתו מול המאגר`);

  return [
    `התווית שהוחזרה: "${recommendation.label ?? "לא הוחזרה"}"`,
    `תוויות מותרות: ${allowed.map((label) => `"${label}"`).join(", ")}`,
    `הסיבה לכלל ההכרעה: ${reasons.length ? reasons.join("; ") : "לא זוהו פערים המחייבים שינוי תווית"}`,
  ].join(". ");
}

export function createRecommendationSummary(
  label: Recommendation["label"],
  facts: RecommendationFacts,
): string {
  const missingFields = facts.databaseComparisons
    .filter((item) => item.status === "missing")
    .map((item) => item.field);
  const mismatchedFields = facts.databaseComparisons
    .filter((item) => item.status === "mismatch")
    .map((item) => item.field);
  const openRequirementFields = facts.requirementComparisons
    .filter((item) => item.status === "unknown" || item.status === "missing" || item.status === "mismatch")
    .map((item) => item.field);

  if (label === "מוכן לאישור") return "ההצעה תואמת לנתוני המאגר ולדרישות הלקוח.";
  if (label === "לא לאשר") return "נמצאה סתירה שאינה מוסברת בין ההצעה לנתוני המאגר או לדרישת חובה.";

  const fields = [...new Set([...missingFields, ...mismatchedFields, ...openRequirementFields])];
  if (fields.length) return `נדרש בירור בפרטים הבאים: ${fields.join(", ")}.`;
  if (facts.unverifiedClaims?.length) return "נדרש בירור של טענות המתווך שלא ניתן לאמת מול המאגר.";
  if (facts.unparsedRequests.length) return "נדרש בירור של בקשות הלקוח שלא ניתן לבדוק מול המאגר.";
  return "נדרש בירור של פרטים חסרים או לא מאומתים לפני קבלת החלטה.";
}
