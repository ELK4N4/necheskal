export type ProposalScreen =
  | { status: "ok"; propertyId: string; propertyIdQuote: string }
  | { status: "missing_property_id" }
  | { status: "multiple_property_ids"; propertyIds: string[] };

/**
 * Find DEMO property identifiers deterministically. The boundaries prevent
 * matching longer alphanumeric identifiers such as XDEMO-001 or DEMO-001A.
 */
export function screenProposal(text: string): ProposalScreen {
  const matches = [...text.matchAll(/(?:^|[^A-Z0-9])(DEMO-\d+)(?=$|[^A-Z0-9])/gi)]
    .map((match) => ({
      id: match[1]!.toUpperCase(),
      quote: match[1]!,
    }));
  const ids = [...new Set(matches.map((match) => match.id))];

  if (ids.length === 0) return { status: "missing_property_id" };
  if (ids.length > 1) return { status: "multiple_property_ids", propertyIds: ids };

  const matchingOccurrence = matches.find((match) => match.id === ids[0])!;
  return {
    status: "ok",
    propertyId: matchingOccurrence.id,
    propertyIdQuote: matchingOccurrence.quote,
  };
}
