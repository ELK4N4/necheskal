import { z } from "zod";
import type { Property } from "../domain/property.schema";
import { ProposalExtractionResponseSchema, ProposalExtractionSchema, normalizeProposalExtraction, type UnverifiedProposalClaim } from "../domain/proposal.schema";
import {
  REQUIREMENT_FIELD_GUIDANCE,
  RequirementsExtractionResponseSchema,
  RequirementsExtractionSchema,
  normalizeRequirementsExtraction,
} from "../domain/requirement.schema";
import { compareProposalToDatabase, getPropertyById } from "../domain/compareProposalToDatabase";
import { evaluateProposalAgainstRequirements } from "../domain/evaluateProposalAgainstRequirements";
import type { RequirementComparison } from "../domain/evaluateProposalAgainstRequirements";
import type { DatabaseComparison } from "../domain/compareProposalToDatabase";
import {
  RecommendationSchema,
  deriveRecommendationLabel,
  type ValidatedRecommendation,
} from "../domain/recommendation.schema";
import { screenProposal } from "../domain/screenProposal";
import { requestStructured, type StructuredOpenAIClient } from "./openaiClient";

export type AnalysisStage = "screening" | "extraction" | "lookup" | "comparison" | "recommendation";
export type AnalysisReport = {
  property: Property;
  proposal: Omit<z.infer<typeof ProposalExtractionSchema>, "propertyId"> & { propertyId: string };
  unverifiedClaims: UnverifiedProposalClaim[];
  requirements: z.infer<typeof RequirementsExtractionSchema>;
  databaseComparisons: ReturnType<typeof compareProposalToDatabase>;
  requirementComparisons: ReturnType<typeof evaluateProposalAgainstRequirements>;
  recommendation: ValidatedRecommendation;
};

const MODEL = "gpt-4o";

export async function runAnalysis(
  client: StructuredOpenAIClient,
  properties: Property[],
  clientRequest: string,
  proposalText: string,
  onStage: (stage: AnalysisStage) => void,
): Promise<AnalysisReport> {
  onStage("screening");
  const screen = screenProposal(proposalText);
  if (screen.status !== "ok") throw new Error(screen.status);

  onStage("lookup");
  const property = getPropertyById(properties, screen.propertyId);
  if (!property) throw new Error("property_not_found");

  onStage("extraction");
  const proposal = await requestStructured(
    client, MODEL,
    `נתח הצעת נדל״ן אחת בלבד והחזר JSON. צטט מילה במילה מתוך הטקסט. החזר propertyId, ציטוט מזהה, fields עבור שדות המאגר שנאמרו במפורש בלבד: propertyId, city, price, rooms, areaSqm, floor, elevator, parking, safeRoom, accessibility, availableFrom. בשדות מספריים price, rooms, areaSqm ו-floor, החזר value כמספר JSON בלבד ללא יחידות, מפרידי אלפים, מטבע או טקסט; לדוגמה, עבור "96 מ״ר" החזר value: 96, ועבור "3.5 חדרים" החזר value: 3.5. עבור availableFrom, חלץ תאריך מפורש גם כשהיום, החודש או השנה כתובים במילים. המר את התאריך ל-ISO מסוג YYYY-MM-DD, תוך התחשבות בהטיות ובצורות כתיב מקובלות של שמות חודשים בעברית. השאר quote כציטוט מדויק ורציף מההצעה. אל תחזיר null רק משום שחלקי התאריך כתובים במילים; החזר null וציטוט ריק רק אם התאריך חסר או עמום ואין דרך חד-משמעית לנרמל אותו. בשדות בוליאניים החזר true או false רק כאשר הטקסט קובע זאת במפורש, אחרת null וציטוט ריק. אל תמציא או תסיק נתונים.

  בנוסף, חלץ כל טענה מפורשת של המתווך שאי אפשר לאמת מול שדות המאגר, וכן כל הסבר או הצדקה לפער מול בקשת הלקוח, ב-unverifiedClaims. החזר לכל פריט claim ו-quote בלבד, בלי שדות נוספים. quote חייב להיות ציטוט מדויק. אל תמציא או תסיק עובדות. אם אין טענות או הסברים, החזר מערך ריק. החזר את כל המפתחות, כולל unverifiedClaims.`,
    proposalText, ProposalExtractionResponseSchema, "proposal_extraction",
  );
  const normalizedProposal = normalizeProposalExtraction(proposal);
  if (normalizedProposal.propertyId !== screen.propertyId) throw new Error("invalid_property_id");
  normalizedProposal.propertyIdQuote = screen.propertyIdQuote;

  const requirements = await requestStructured(
    client, MODEL,
    `חלץ את כל דרישות הלקוח שאפשר לבדוק. השתמש בשמות השדות הקנוניים הבאים בלבד: ${REQUIREMENT_FIELD_GUIDANCE}. למחיר או לתקציב השתמש תמיד ב-price; למספר חדרים השתמש ב-rooms. למועד שבו אפשר להיכנס לנכס, מועד כניסה, כניסה לדירה, פינוי, מסירה או זמינות הנכס השתמש תמיד בשדה availableFrom. אלה ניסוחים שונים לאותה דרישה של מועד זמינות הנכס. אל תסווג אותם כבקשה שאין עליה מידע במאגר אם ניתן לחלץ מהם תאריך. ברירת המחדל היא must. השתמש ב-preference רק כשהלקוח אמר במפורש שזו העדפה. ציטוט evidenceQuote חייב להיות מדויק ורציף. אל תמציא דרישות.

אם בקשת הלקוח מתייחסת לפרט שלא מופיע בשדות המאגר, הוסף אותה ל-unparsedRequests עם ציטוט מדויק והסבר בעברית פשוטה. הסבר שהמידע אינו מופיע במאגר ולכן אי אפשר לבדוק את הבקשה, וציין מה צריך לברר. אל תשתמש במונחים טכניים כמו "שדות קנוניים" בהסבר שמוצג למנהל. אל תנחש פרטים שאינם מופיעים בבקשה. החזר אובייקט JSON עם requirements (מערך) ו-unparsedRequests (מערך), גם אם הם ריקים.`,
    clientRequest, RequirementsExtractionResponseSchema, "client_requirements",
  );
  const validatedRequirements = normalizeRequirementsExtraction(requirements);

  onStage("comparison");
  const databaseComparisons = compareProposalToDatabase(property, normalizedProposal.fields);
  const requirementComparisons = evaluateProposalAgainstRequirements(normalizedProposal.fields, validatedRequirements.requirements);

  onStage("recommendation");
  const modelRecommendation = await requestStructured(
    client, MODEL,
      `נסח את כל הטקסטים בעברית בלבד, כולל summary, strengths[].text, strengths[].evidence, weaknesses[].text ו-weaknesses[].evidence. שמור ציטוטי ראיות מדויקים כפי שהופיעו במקור. כל פריט ב-unverifiedClaims הוא טענה או הסבר מפורש של המתווך, ויש להשתמש בציטוט המקורי כראיה.
נסח המלצה פנימית מתוך הממצאים בלבד, בלי להוסיף עובדות או להעריך אם טענת מתווך נכונה או משכנעת.
בחר תווית אחת מתוך "לא לאשר", "מוכן לאישור", "נדרש בירור". אם יש לפחות פריט אחד ב-unverifiedClaims, ברירת המחדל היא "נדרש בירור". אין לכתוב "לא לאשר" רק מפני שהפער משמעותי בעיניך. בחר "לא לאשר" רק אם יש דרישת חובה שלא מתקיימת או סתירה אחרת לנתוני המאגר, שאינה תלויה בטענת המתווך ואינה נפתרת על ידה. טענת מתווך לא מאומתת אינה מוכיחה שהנתון שגוי, אך מחייבת בירור. "מוכן לאישור" מותר רק כשאין פערים, טענות לא מאומתות או שאלות פתוחות. בסיכום, ציין בקצרה את הפער ואת טענת המתווך שיש לבדוק, בלי להכריע אם היא נכונה.
החזר JSON בלבד ובדיוק לפי הסכמה. השדה summary הוא משפט חובה שאורכו לפחות תו אחד ומסביר את התווית. strengths ו-weaknesses יהיו מערכים של {text, evidence}. החזר את כל השדות גם כשאין פריטים, עם מערכים ריקים.`,
     JSON.stringify({ proposalText, databaseComparisons, requirementComparisons, unparsedRequests: validatedRequirements.unparsedRequests, unverifiedClaims: proposal.unverifiedClaims }),
     RecommendationSchema, "recommendation",
   );
  const recommendation = {
    ...modelRecommendation,
    label: deriveRecommendationLabel({
      databaseComparisons,
      requirementComparisons,
      unparsedRequests: validatedRequirements.unparsedRequests,
      unverifiedClaims: proposal.unverifiedClaims,
    }),
  };

  return {
    property,
    proposal: { ...normalizedProposal, propertyId: normalizedProposal.propertyId },
    unverifiedClaims: proposal.unverifiedClaims,
    requirements: validatedRequirements,
    databaseComparisons,
    requirementComparisons,
    recommendation,
  };
}

export function buildRecommendationSummary(
  label: ValidatedRecommendation["label"],
  databaseComparisons: DatabaseComparison[],
  requirementComparisons: RequirementComparison[],
  unparsedRequestCount: number,
  unverifiedClaimCount: number,
  unverifiedClaims: UnverifiedProposalClaim[] = [],
): string {
  const reasons: string[] = [];

  const databaseMismatches = databaseComparisons.filter((item) => item.status === "mismatch");
  const mustMismatches = requirementComparisons.filter(
    (item) => item.status === "mismatch" && item.importance === "must",
  );
  const openMust = requirementComparisons.filter(
    (item) => item.status === "missing" && item.importance === "must",
  );
  const unknowns = requirementComparisons.filter((item) => item.status === "unknown");
  const preferenceMismatches = requirementComparisons.filter(
    (item) => (item.status === "missing" || item.status === "mismatch") && item.importance === "preference",
  );

  if (databaseMismatches.length) {
    reasons.push(`סתירות בין הצעת המתווך למאגר: ${formatComparisons(databaseMismatches, "database")}`);
  }
  if (mustMismatches.length) {
    reasons.push(`דרישות חובה של הלקוח אינן מתקיימות לפי הצעת המתווך: ${formatComparisons(mustMismatches, "requirement")}`);
  }
  if (openMust.length) reasons.push(`חסרה בדיקת חובה: ${formatFields(openMust.map((item) => item.field))}`);
  if (unknowns.length) reasons.push(`נתון לא מאומת: ${formatFields(unknowns.map((item) => item.field))}`);
  if (unverifiedClaimCount) {
    const claimDescriptions = unverifiedClaims.map((claim) => claim.claim);
    reasons.push(claimDescriptions.length
      ? `טענת מתווך לא אומתה: ${claimDescriptions.join(", ")}`
      : "טענת מתווך לא אומתה.");
  }
  if (unparsedRequestCount) reasons.push("יש בקשת לקוח שאין עליה מידע במאגר, ולכן צריך לברר אותה.");
  if (preferenceMismatches.length) {
    reasons.push(`העדפת הלקוח אינה מתקיימת או לא נבדקה לפי הצעת המתווך: ${formatComparisons(preferenceMismatches, "requirement")}`);
  }

  if (!reasons.length) {
    return label === "מוכן לאישור"
      ? "ההצעה תואמת לדרישות ולנתוני המאגר."
      : recommendationFallback(label);
  }

  return reasons.slice(0, 2).join("; ").replace(/\.+$/, "") + ".";
}

function formatComparisons(
  comparisons: Array<DatabaseComparison | RequirementComparison>,
  kind: "database" | "requirement",
): string {
  return comparisons.map((item) => {
    const field = formatFields([item.field]);
    if (kind === "database") {
      const comparison = item as DatabaseComparison;
      return `${field} (בהצעה: ${formatSummaryValue(comparison.proposalValue)}; במאגר: ${formatSummaryValue(comparison.databaseValue)})`;
    }

    const comparison = item as RequirementComparison;
    return `${field} (בקשת הלקוח: ${formatSummaryValue(comparison.requestedValue)}; בהצעה: ${formatSummaryValue(comparison.proposalValue)})`;
  }).join(", ");
}

function formatSummaryValue(value: unknown): string {
  if (value === null || value === undefined) return "לא צוין";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "number" && value > 1000) {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);
  }
  return String(value);
}

function formatFields(fields: string[]): string {
  const labels: Record<string, string> = {
    propertyId: "מזהה הנכס",
    city: "עיר",
    price: "מחיר",
    rooms: "מספר חדרים",
    areaSqm: "שטח",
    floor: "קומה",
    elevator: "מעלית",
    parking: "חניה",
    safeRoom: "ממ״ד",
    accessibility: "נגישות",
    availableFrom: "זמינות מתאריך",
  };
  return [...new Set(fields)].map((field) => labels[field] ?? field).join(", ");
}

function recommendationFallback(label: ValidatedRecommendation["label"]): string {
  switch (label) {
    case "לא לאשר":
      return "נמצאו פערים מהותיים בהצעה.";
    case "נדרש בירור":
      return "יש פרטים שדורשים בירור.";
    case "מוכן לאישור":
      return "ההצעה תואמת לדרישות ולנתוני המאגר.";
  }
}
