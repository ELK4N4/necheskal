import type { ProposalField } from "./proposal.schema";
import type { ClientRequirement } from "./requirement.schema";
import type { ComparisonStatus } from "./compareProposalToDatabase";
export type RequirementComparison = {
  field: string;
  operator: ClientRequirement["operator"];
  requestedValue: ClientRequirement["value"];
  proposalValue: string | number | boolean | null;
  importance: ClientRequirement["importance"];
  status: ComparisonStatus;
  proposalQuote: string | null;
  requestQuote: string;
  brokerExplanation?: string;
};

function satisfies(value: string | number | boolean, requirement: ClientRequirement): boolean {
  const target = requirement.value;
  switch (requirement.operator) {
    case "eq": return value === target;
    case "gte": return typeof value === "number" && typeof target === "number" && value >= target;
    case "gt": return typeof value === "number" && typeof target === "number" && value > target;
    case "lte": return typeof value === "number" && typeof target === "number" && value <= target;
    case "lt": return typeof value === "number" && typeof target === "number" && value < target;
    case "between": return typeof value === "number" && Array.isArray(target) && value >= target[0] && value <= target[1];
  }
}

export function evaluateProposalAgainstRequirements(
  proposal: ProposalField[],
  requirements: ClientRequirement[],
): RequirementComparison[] {
  return requirements.map((requirement) => {
    const claim = proposal.find((field) => field.field === requirement.field);
    let status: ComparisonStatus;
    if (!claim) {
      status = "missing";
    } else {
      status = satisfies(claim.value, requirement) ? "match" : "mismatch";
    }
    return {
      field: requirement.field,
      operator: requirement.operator,
      requestedValue: requirement.value,
      proposalValue: claim?.value ?? null,
      importance: requirement.importance,
      status,
      proposalQuote: claim?.quote ?? null,
      requestQuote: requirement.evidenceQuote,
    };
  });
}
