import { describe, expect, it } from "vitest";
import { compareProposalToDatabase } from "./compareProposalToDatabase";
import type { Property } from "./property.schema";

const property: Property = {
  propertyId: "DEMO-001",
  city: "רמת גן",
  price: 2_000_000,
  rooms: 4,
  areaSqm: 96,
  floor: 3,
  elevator: false,
  parking: true,
  safeRoom: true,
  accessibility: true,
  availableFrom: "2027-01-15",
};

describe("compareProposalToDatabase", () => {
  it("compares only known database fields and ignores extra broker details", () => {
    const comparisons = compareProposalToDatabase(property, [
      { field: "rooms", value: 4, quote: "4 חדרים" },
      { field: "balcony", value: true, quote: "יש מרפסת גדולה" },
    ]);

    expect(comparisons).toHaveLength(10);
    expect(comparisons.some((comparison) => comparison.field === "balcony")).toBe(false);
    expect(comparisons.find((comparison) => comparison.field === "rooms")?.status).toBe("match");
  });
});
