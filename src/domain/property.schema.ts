import { z } from "zod";

export const PropertySchema = z.object({
  propertyId: z.string().trim().min(1),
  city: z.string().trim().min(1),
  price: z.number().positive(),
  rooms: z.number().positive(),
  areaSqm: z.number().positive(),
  floor: z.number().int(),
  elevator: z.boolean(),
  parking: z.boolean(),
  safeRoom: z.boolean(),
  accessibility: z.boolean(),
  availableFrom: z.iso.date(),
}).strict();

export const PropertyListSchema = z.array(PropertySchema)
  .length(5, "מאגר הנכסים חייב להכיל בדיוק חמש רשומות")
  .superRefine((properties, ctx) => {
    const seen = new Set<string>();
    properties.forEach((property, index) => {
      if (seen.has(property.propertyId)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "propertyId"],
          message: `מזהה נכס כפול: ${property.propertyId}`,
        });
      }
      seen.add(property.propertyId);
    });
  });

export type Property = z.infer<typeof PropertySchema>;

export const PROPERTY_FIELDS = [
  "propertyId", "city", "price", "rooms", "areaSqm", "floor",
  "elevator", "parking", "safeRoom", "accessibility", "availableFrom",
] as const;

export type PropertyField = typeof PROPERTY_FIELDS[number];

export const FIELD_LABELS: Record<string, string> = {
  propertyId: "מזהה נכס",
  city: "עיר",
  price: "מחיר",
  rooms: "חדרים",
  areaSqm: "שטח",
  floor: "קומה",
  elevator: "מעלית",
  parking: "חניה",
  safeRoom: "ממ״ד",
  accessibility: "נגישות",
  availableFrom: "זמינות מתאריך",
  balcony: "מרפסת",
  view: "נוף",
};
