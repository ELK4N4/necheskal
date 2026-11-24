import { z } from "zod";
import { FIELD_LABELS, PROPERTY_FIELDS, PropertySchema } from "./property.schema";

const REQUIREMENT_FIELD_ALIASES: Record<string, string> = {
  number_of_rooms: "rooms",
  room_count: "rooms",
  asking_price: "price",
  max_price: "price",
  budget: "price",
  area: "areaSqm",
  size: "areaSqm",
  accessible: "accessibility",
  safe_room: "safeRoom",
  available_from: "availableFrom",
};

export function normalizeRequirementField(field: string): string {
  const normalized = field.trim().replace(/[\s-]+/g, "_").toLowerCase();
  if (REQUIREMENT_FIELD_ALIASES[normalized]) return REQUIREMENT_FIELD_ALIASES[normalized];
  const canonical = PROPERTY_FIELDS.find((candidate) => candidate.toLowerCase() === normalized);
  return canonical ?? field.trim();
}

export function normalizeRequirementsExtraction(
  result: z.infer<typeof RequirementsExtractionResponseSchema>,
): z.infer<typeof RequirementsExtractionSchema> {
  const unparsedRequests = [...result.unparsedRequests];
  const requirements = result.requirements.flatMap((requirement) => {
    const normalized = normalizeClientRequirement(requirement);
    const parsed = ClientRequirementSchema.safeParse(normalized);
    if (parsed.success) return [parsed.data];
    unparsedRequests.push({
      quote: requirement.evidenceQuote,
      reason: "לא ניתן לפרש את הבקשה באופן חד-משמעי. כדאי לבדוק אותה ידנית.",
    });
    return [];
  });

  return RequirementsExtractionSchema.parse({ requirements, unparsedRequests });
}

function normalizeClientRequirement<T extends { field: string; value: unknown }>(requirement: T): T {
  const field = normalizeRequirementField(requirement.field);
  let value = requirement.value;
  if (field === "availableFrom" && typeof value === "string") {
    const numeric = value.trim();
    const dateParts = numeric.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    const hebrew = numeric.match(/^(\d{1,2})\s+(?:ב)?(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+(\d{4})$/);
    if (dateParts) {
      const [, first, second, year] = dateParts;
      const day = Number(first) > 12 ? Number(first) : Number(second);
      const month = Number(first) > 12 ? Number(second) : Number(first);
      value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    } else if (hebrew) {
      const months: Record<string, string> = {
        ינואר: "01", פברואר: "02", מרץ: "03", אפריל: "04", מאי: "05", יוני: "06",
        יולי: "07", אוגוסט: "08", ספטמבר: "09", אוקטובר: "10", נובמבר: "11", דצמבר: "12",
      };
      const [, day, month, year] = hebrew;
      value = `${year}-${months[month]}-${day.padStart(2, "0")}`;
    }
  }
  return { ...requirement, field, value } as T;
}

export const REQUIREMENT_FIELD_GUIDANCE = PROPERTY_FIELDS
  .filter((field) => field !== "propertyId")
  .map((field) => `${field} (${FIELD_LABELS[field] ?? field})`)
  .join(", ");

const OperatorSchema = z.enum(["eq", "gte", "gt", "lte", "lt", "between"]);

const ClientRequirementResponseSchema = z.object({
  field: z.string().trim().min(1),
  operator: OperatorSchema,
  value: z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(z.number().finite()).length(2),
  ]),
  importance: z.enum(["must", "preference"]),
  evidenceQuote: z.string().min(1),
}).strict();

export const RequirementsExtractionResponseSchema = z.object({
  requirements: z.array(ClientRequirementResponseSchema),
  unparsedRequests: z.array(z.object({
    quote: z.string().min(1),
    reason: z.string().min(1),
  }).strict()),
}).strict();

export const ClientRequirementSchema = ClientRequirementResponseSchema.superRefine((requirement, ctx) => {
  if (requirement.operator === "between") {
    if (!Array.isArray(requirement.value) || requirement.value[0] > requirement.value[1]) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "טווח between חייב להיות בסדר עולה" });
      return;
    }
  } else if (Array.isArray(requirement.value)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "מערך ערכים מותר רק עם between" });
    return;
  }

  const field = requirement.field as keyof typeof PropertySchema.shape;
  const schema = PropertySchema.shape[field];
  if (!schema) {
    ctx.addIssue({ code: "custom", path: ["field"], message: "שדה הדרישה אינו מוכר" });
    return;
  }

  const numericFields = ["price", "rooms", "areaSqm", "floor"];
  const numericOperator = ["gte", "gt", "lte", "lt", "between"].includes(requirement.operator);
  if (numericOperator && !numericFields.includes(requirement.field)) {
    ctx.addIssue({ code: "custom", path: ["operator"], message: "אופרטור מספרי מותר רק לשדה מספרי" });
  }
  if (requirement.operator === "between" && !numericFields.includes(requirement.field)) {
    ctx.addIssue({ code: "custom", path: ["operator"], message: "between מותר רק לשדה מספרי" });
  }
  if (numericFields.includes(requirement.field)) {
    const numberOrRange = Array.isArray(requirement.value)
      ? requirement.value.every((item) => typeof item === "number")
      : typeof requirement.value === "number";
    if (!numberOrRange) ctx.addIssue({ code: "custom", path: ["value"], message: "שדה מספרי דורש ערך מספרי" });
  } else if (!Array.isArray(requirement.value) && !schema.safeParse(requirement.value).success) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "ערך הדרישה אינו תואם לטיפוס השדה" });
  }
  if (["elevator", "parking", "safeRoom", "accessibility"].includes(requirement.field)
    && requirement.operator !== "eq") {
    ctx.addIssue({ code: "custom", path: ["operator"], message: "שדה בוליאני תומך רק ב-eq" });
  }
});

export const RequirementsExtractionSchema = RequirementsExtractionResponseSchema.superRefine((result, ctx) => {
  result.requirements.forEach((requirement, index) => {
    const parsed = ClientRequirementSchema.safeParse(normalizeClientRequirement(requirement));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["requirements", index, ...issue.path],
        });
      }
    }
  });
});

export type ClientRequirement = z.infer<typeof ClientRequirementSchema>;
export type RequirementsExtraction = z.infer<typeof RequirementsExtractionSchema>;
