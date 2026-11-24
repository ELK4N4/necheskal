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
  unverifiedClaims?: Array<{ claim?: string; quote?: string }>;
};

export function allowedRecommendationLabels(facts: RecommendationFacts): Set<Recommendation["label"]> {
  const hasUnknown = facts.requirementComparisons.some((item) => item.status === "unknown");
  const hasNonPreferenceDatabaseMismatch = facts.databaseComparisons.some(
    (item) => item.status === "mismatch"
      && !hasBrokerExplanationForField(facts, item.field),
  );
  const hasUnexplainedMustMismatch = facts.requirementComparisons.some(
    (item) => item.status === "mismatch"
      && item.importance === "must"
      && !item.brokerExplanation?.trim()
      && !hasBrokerExplanationForField(facts, item.field),
  );
  const hasPreferenceMismatch = facts.requirementComparisons.some(
    (item) => item.status === "mismatch" && item.importance === "preference",
  );
  const hasOpenMust = facts.requirementComparisons.some((item) =>
    item.importance === "must" && item.status === "missing");
  const hasUnparsed = facts.unparsedRequests.length > 0;
  const hasUnverifiedClaims = (facts.unverifiedClaims?.length ?? 0) > 0;
  if (hasNonPreferenceDatabaseMismatch || hasUnexplainedMustMismatch) {
    return new Set(["לא לאשר"]);
  }
  if (hasPreferenceMismatch) return new Set(["נדרש בירור"]);
  if (hasUnknown || hasOpenMust || hasUnparsed || hasUnverifiedClaims) return new Set(["נדרש בירור"]);
  return new Set(["מוכן לאישור"]);
}

export function deriveRecommendationLabel(facts: RecommendationFacts): Recommendation["label"] {
  const hasUnexplainedMustMismatch = facts.requirementComparisons.some(
    (item) => item.status === "mismatch"
      && item.importance === "must"
      && !item.brokerExplanation?.trim()
      && !hasBrokerExplanationForField(facts, item.field),
  );
  const hasNonPreferenceDatabaseMismatch = facts.databaseComparisons.some(
    (item) => item.status === "mismatch"
      && !hasBrokerExplanationForField(facts, item.field),
  );
  const hasUnexplainedPreferenceMismatch = facts.requirementComparisons.some(
    (item) => item.status === "mismatch"
      && item.importance === "preference"
      && !item.brokerExplanation?.trim()
      && !hasBrokerExplanationForField(facts, item.field),
  );
  if (hasNonPreferenceDatabaseMismatch || hasUnexplainedMustMismatch || hasUnexplainedPreferenceMismatch) {
    return "לא לאשר";
  }

  if (
    facts.requirementComparisons.some((item) =>
      item.status === "unknown"
      || (item.importance === "must" && item.status === "missing")
      || (item.importance === "must" && item.status === "mismatch" && Boolean(item.brokerExplanation))
      || (item.importance === "preference" && (item.status === "missing" || item.status === "mismatch")),
    )
    || facts.unparsedRequests.length > 0
    || (facts.unverifiedClaims?.length ?? 0) > 0
  ) {
    return "נדרש בירור";
  }

  return "מוכן לאישור";
}

function hasBrokerExplanationForField(facts: RecommendationFacts, field: string): boolean {
  const requirementExplanation = facts.requirementComparisons.some(
    (item) => item.field === field && Boolean(item.brokerExplanation?.trim()),
  );
  const brokerClaim = facts.unverifiedClaims?.some((claim) => {
    const text = `${claim.claim ?? ""} ${claim.quote ?? ""}`;
    return text.trim().length > 0 && claimRefersToField(text, field);
  }) ?? false;
  return requirementExplanation || brokerClaim;
}

function claimRefersToField(text: string, field: string): boolean {
  const patterns: Record<string, RegExp> = {
    city: /עיר|מיקום|סמוך|קרוב|שכונה|אזור/,
    price: /מחיר|תקציב|עלות|יקר|זול|₪|ש״ח/,
    rooms: /חדרים|חדר/,
    areaSqm: /שטח|מ״ר|מר/,
    floor: /קומה/,
    elevator: /מעלית/,
    parking: /חניה|חנייה|חניון/,
    safeRoom: /ממ״ד|מרחב מוגן/,
    accessibility: /נגיש|נגישות/,
    availableFrom: /זמינות|פינוי|כניסה|מסירה|תאריך|פנויה|פנוי/,
  };
  return patterns[field]?.test(text) ?? false;
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

  const fieldList = (fields: string[]) => [...new Set(fields)].join(", ");
  if (databaseMismatches.length) reasons.push(`סתירה במאגר בשדות: ${fieldList(databaseMismatches)}`);
  if (mustMismatches.length) reasons.push(`דרישות חובה שלא מתקיימות: ${fieldList(mustMismatches)}`);
  else if (openMust.length) reasons.push(`דרישות חובה פתוחות: ${fieldList(openMust)}`);
  if (explainedMustMismatches.length) reasons.push(`דרישות חובה עם הסבר מתווך לבדיקה: ${fieldList(explainedMustMismatches)}`);
  if (unknowns.length) reasons.push(`נתונים לא מאומתים בשדות: ${fieldList(unknowns)}`);
  if (facts.unparsedRequests.length) reasons.push(`${facts.unparsedRequests.length} בקשות לא פוענחו`);
  if (facts.unverifiedClaims?.length) reasons.push(`${facts.unverifiedClaims.length} טענות מתווך לא אומתו מול המאגר`);

  return [
    `התווית שהוחזרה: "${recommendation.label ?? "לא הוחזרה"}"`,
    `תוויות מותרות: ${allowed.map((label) => `"${label}"`).join(", ")}`,
    `הסיבה לכלל ההכרעה: ${reasons.length ? reasons.join("; ") : "לא זוהו פערים המחייבים שינוי תווית"}`,
  ].join(". ");
}
