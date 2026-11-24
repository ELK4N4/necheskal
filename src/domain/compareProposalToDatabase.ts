import type { Property } from "./property.schema";
import { PROPERTY_FIELDS } from "./property.schema";
import type { ProposalField } from "./proposal.schema";

export type ComparisonStatus = "match" | "mismatch" | "unknown" | "missing";
export type DatabaseComparison = {
  field: string;
  proposalValue: string | number | boolean | null;
  databaseValue: string | number | boolean | null;
  status: ComparisonStatus;
  proposalQuote: string | null;
};

export function getPropertyById(properties: Property[], propertyId: string): Property | undefined {
  return properties.find((property) => property.propertyId === propertyId);
}

export function compareProposalToDatabase(property: Property, proposal: ProposalField[]): DatabaseComparison[] {
  const byField = new Map(proposal.map((field) => [field.field, field]));
  const results: DatabaseComparison[] = [];

  for (const field of PROPERTY_FIELDS.filter((key) => key !== "propertyId")) {
    const claim = byField.get(field);
    if (!claim) {
      results.push({ field, proposalValue: null, databaseValue: property[field], status: "missing", proposalQuote: null });
      continue;
    }
    const databaseValue = property[field];
    results.push({
      field,
      proposalValue: claim.value,
      databaseValue,
      status: claim.value === databaseValue ? "match" : "mismatch",
      proposalQuote: claim.quote,
    });
  }

  return results;
}
