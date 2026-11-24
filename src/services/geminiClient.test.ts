import { describe, expect, it } from "vitest";
import { createGeminiClient, describeError, getUserFacingApiError, requestStructured } from "./geminiClient";
import { z } from "zod";
import { ProposalExtractionResponseSchema } from "../domain/proposal.schema";
import { RequirementsExtractionResponseSchema } from "../domain/requirement.schema";
import { RecommendationSchema } from "../domain/recommendation.schema";

describe("Gemini error messages", () => {
  it("reports network errors as connectivity problems", () => {
    const error = new Error("fetch failed");
    expect(getUserFacingApiError(error)).toContain("החיבור");
  });

  it("does not report application validation errors as network failures", () => {
    expect(getUserFacingApiError(new Error("property_not_found"))).toContain("בדקו את פרטי ההצעה");
    expect(getUserFacingApiError(new Error("invalid_recommendation"))).toContain("בדקו את פרטי ההצעה");
  });

  it("reports an unexpected error without claiming the connection failed", () => {
    const message = getUserFacingApiError(new Error("unexpected client error"));
    expect(message).toContain("שגיאה לא צפויה");
    expect(message).not.toContain("להתחבר");
  });

  it("includes safe diagnostic details for non-Error thrown values", () => {
    expect(describeError("request failed")).toBe("request failed");
    expect(describeError({ message: "provider failure" })).toBe("provider failure");
    expect(getUserFacingApiError({ message: "provider failure" })).toContain("provider failure");
  });

  it("preserves local Zod validation issues for an API response", async () => {
    const client = createGeminiClient("test", async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ count: "not a number" }) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const schema = z.object({ count: z.number() });

    await expect(requestStructured(client, "gemini-3.8-flash", "system", "user", schema, "test"))
      .rejects.toMatchObject({
        cause: {
          cause: {
            issues: [expect.objectContaining({ path: ["count"] })],
          },
        },
      });
  });

  it("retries once when the model output fails schema validation", async () => {
    let calls = 0;
    const client = createGeminiClient("test", async () => {
      calls += 1;
      const count = calls === 1 ? "not a number" : 3;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ count }) }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const schema = z.object({ count: z.number() });

    await expect(requestStructured(client, "gemini-3.8-flash", "system", "user", schema, "test"))
      .resolves.toEqual({ count: 3 });
    expect(calls).toBe(2);
  });

  it("parses strict structured output", async () => {
    const client = createGeminiClient("test", async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ count: 3 }) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const schema = z.object({ count: z.number() }).strict();

    await expect(requestStructured(client, "gemini-3.8-flash", "system", "user", schema, "test"))
      .resolves.toEqual({ count: 3 });
  });

  it("reports invalid structured output separately from connectivity failures", () => {
    expect(getUserFacingApiError(new Error("Could not parse the response body"))).toContain("פורמט לא תקין");
    expect(getUserFacingApiError(new SyntaxError("Unexpected token"))).toContain("תשובה שלא ניתן לקרוא");
    expect(getUserFacingApiError(new Error("invalid schema"))).toBe("המודל לא הצליח להחזיר תשובה בפורמט הנדרש. נסו שוב.");
  });

  it("maps common API response codes to actionable messages", () => {
    expect(getUserFacingApiError(new Error("401 unauthorized: invalid api key"))).toContain("מפתח");
    expect(getUserFacingApiError(new Error("429 rate limit exceeded"))).toContain("מכסת");
    expect(getUserFacingApiError(new Error("403 forbidden"))).toContain("מורשה");
  });

  it("builds Zod schemas for every analysis response", () => {
    expect(ProposalExtractionResponseSchema.safeParse({
      proposalCount: 1, readable: true, propertyId: "DEMO-001", propertyIdQuote: "DEMO-001", fields: [], unverifiedClaims: [],
    }).success).toBe(true);
    expect(RequirementsExtractionResponseSchema.safeParse({
      requirements: [], unparsedRequests: [],
    }).success).toBe(true);
    expect(RecommendationSchema.safeParse({
      label: "נדרש בירור", summary: "צריך לבדוק", strengths: [], weaknesses: [],
    }).success).toBe(true);
  });
});
