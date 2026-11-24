import { describe, expect, it } from "vitest";
import { evaluateProposalAgainstRequirements } from "./evaluateProposalAgainstRequirements";
import type { ClientRequirement } from "./requirement.schema";
import type { ProposalField } from "./proposal.schema";

describe("evaluateProposalAgainstRequirements", () => {
  it("compares proposal values to client requirements without needing database fields", () => {
    const proposal: ProposalField[] = [
      { field: "balcony", value: true, quote: "יש מרפסת" },
    ];
    const requirements = [{
      field: "balcony",
      operator: "eq",
      value: true,
      importance: "must",
      evidenceQuote: "מרפסת",
    }] as ClientRequirement[];

    expect(evaluateProposalAgainstRequirements(proposal, requirements)).toMatchObject([
      { field: "balcony", proposalValue: true, status: "match" },
    ]);
  });

  it("marks an unmentioned proposal requirement as missing", () => {
    const requirements = [{
      field: "balcony",
      operator: "eq",
      value: true,
      importance: "must",
      evidenceQuote: "מרפסת",
    }] as ClientRequirement[];

    expect(evaluateProposalAgainstRequirements([], requirements)).toMatchObject([
      { field: "balcony", proposalValue: null, status: "missing" },
    ]);
  });

});
