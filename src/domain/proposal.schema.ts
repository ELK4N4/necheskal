import { z } from "zod";
import { PropertySchema } from "./property.schema";

export const ProposalFieldSchema = z.object({
  field: z.string().trim().min(1),
  value: z.union([z.string(), z.number().finite(), z.boolean()]),
  quote: z.string().min(1),
}).strict();

export const UnverifiedProposalClaimSchema = z.object({
  field: z.string().trim().min(1).nullable().optional(),
  claim: z.string().trim().min(1),
  quote: z.string().trim().min(1),
}).strict();

const ProposalExtractionModelFieldSchema = z.object({
  field: z.string().trim().min(1),
  value: z.union([z.string(), z.number().finite(), z.boolean()]).nullable(),
  quote: z.string(),
}).strict();

const ProposalExtractionResponseBaseSchema = z.object({
  proposalCount: z.number().int().min(0).max(20),
  readable: z.boolean(),
  propertyId: z.string().trim().min(1).nullable(),
  propertyIdQuote: z.string().nullable(),
  fields: z.array(ProposalExtractionModelFieldSchema),
  unverifiedClaims: z.array(UnverifiedProposalClaimSchema),
}).strict();

export const ProposalExtractionResponseSchema = ProposalExtractionResponseBaseSchema.transform((response) => ({
  ...response,
  fields: response.fields.filter((field): field is typeof field & { value: string | number | boolean } =>
    field.value !== null && Boolean(field.quote.trim()),
  ),
}));

export const ProposalExtractionSchema = ProposalExtractionResponseSchema.superRefine((result, ctx) => {
  const values = new Map<string, string>();
  result.fields.forEach((field, index) => {
    if (!(field.field in PropertySchema.shape)) {
      ctx.addIssue({
        code: "custom",
        path: ["fields", index, "field"],
        message: `שדה לא מוכר: ${field.field}`,
      });
      return;
    }

    const value = JSON.stringify(field.value);
    if (values.has(field.field) && values.get(field.field) !== value) {
      ctx.addIssue({
        code: "custom",
        path: ["fields", index, "field"],
        message: `ערכים סותרים לשדה ${field.field}`,
      });
    }
    values.set(field.field, value);

    const fieldSchema = PropertySchema.shape[field.field as keyof typeof PropertySchema.shape];
    if (fieldSchema && !fieldSchema.safeParse(field.value).success) {
      ctx.addIssue({
        code: "custom",
        path: ["fields", index, "value"],
        message: `הערך בשדה ${field.field} אינו תואם לטיפוס הנתונים`,
      });
    }
  });
  if (result.propertyId && !result.propertyIdQuote) {
    ctx.addIssue({ code: "custom", path: ["propertyIdQuote"], message: "חסר ציטוט למזהה הנכס" });
  }
});

export function normalizeProposalExtraction(
  response: z.infer<typeof ProposalExtractionResponseSchema>,
): z.infer<typeof ProposalExtractionSchema> {
  return ProposalExtractionSchema.parse({
    ...response,
    propertyId: normalizePropertyId(response.propertyId),
    fields: response.fields.flatMap((field) => {
      const normalized = normalizeProposalField(field);
      return normalized ? [normalized] : [];
    }),
  });
}

export type UnverifiedProposalClaim = z.infer<typeof UnverifiedProposalClaimSchema>;

function normalizePropertyId(value: string | null): string | null {
  if (!value) return value;
  // Property IDs are identifiers, not natural-language text. Correct common
  // model formatting differences without inventing or changing the ID itself.
  return value.trim().replace(/[\s־–—]+/g, "-").replace(/-+/g, "-").toUpperCase();
}

export function normalizeProposalField(field: z.infer<typeof ProposalFieldSchema>): z.infer<typeof ProposalFieldSchema> | null {
  let normalizedField = field;
  if (field.field === "price" || field.field === "rooms" || field.field === "areaSqm" || field.field === "floor") {
    if (typeof field.value === "string") {
      const numericText = field.value.trim().replace(/[₪,\s]/g, "");
      const numericValue = Number(numericText);
      if (numericText && Number.isFinite(numericValue)) {
        normalizedField = { ...field, value: numericValue };
      }
    }
  }
  if (normalizedField.field === "availableFrom") {
    const value = typeof normalizedField.value === "string"
      ? normalizeProposalDate(normalizedField.value)
      : null;
    if (!value && !normalizeProposalDate(normalizedField.quote)) return null;
    return { ...normalizedField, value: value ?? normalizeProposalDate(normalizedField.quote)! };
  }

  if (typeof normalizedField.value !== "string") return normalizedField;
  return normalizedField;
}

function normalizeProposalDate(value: string): string | null {
  const source = value.trim();
  const numeric = source
    .replace(/^זמינות\s*/u, "")
    .replace(/^[מלתבוכ][־-]?/u, "")
    .trim()
    .replace(/^[מלתבוכ](?=\d)/u, "");
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(numeric)) {
    const [first, second, year] = numeric.split(/[./-]/).map(Number);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return z.iso.date().safeParse(isoDate).success ? isoDate : null;
  }

  const hebrewMonths: Record<string, number> = {
    ינואר: 1, בינואר: 1,
    פברואר: 2, בפברואר: 2,
    מרץ: 3, במרץ: 3,
    אפריל: 4, באפריל: 4,
    מאי: 5, במאי: 5,
    יוני: 6, ביוני: 6,
    יולי: 7, ביולי: 7,
    אוגוסט: 8, באוגוסט: 8,
    ספטמבר: 9, בספטמבר: 9,
    אוקטובר: 10, באוקטובר: 10,
    נובמבר: 11, בנובמבר: 11,
    דצמבר: 12, בדצמבר: 12,
  };
  const monthPattern = "ינואר|בינואר|פברואר|בפברואר|מרץ|במרץ|אפריל|באפריל|מאי|במאי|יוני|ביוני|יולי|ביולי|אוגוסט|באוגוסט|ספטמבר|בספטמבר|אוקטובר|באוקטובר|נובמבר|בנובמבר|דצמבר|בדצמבר";
  const hebrew = numeric.match(new RegExp(`^(\\d{1,2})\\s+(?:ב)?(${monthPattern})\\s+(\\d{4})$`));
  const quotedHebrew = source.match(new RegExp(`(?:^|[^\\d])(?:מ[־-]?\\s*)?(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{4})(?:$|[^\\d])`));
  const match = hebrew ?? quotedHebrew;
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = hebrewMonths[monthText];
  const year = Number(yearText);
  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return z.iso.date().safeParse(isoDate).success ? isoDate : null;
}

export type ProposalField = z.infer<typeof ProposalFieldSchema>;
export type ProposalExtraction = z.infer<typeof ProposalExtractionSchema>;
