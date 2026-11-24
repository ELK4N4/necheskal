import { describe, expect, it } from "vitest";
import { screenProposal } from "./screenProposal";

describe("screenProposal", () => {
  it("returns a missing-id error when there is no DEMO identifier", () => {
    expect(screenProposal("דירת 4 חדרים בתל אביב")).toEqual({ status: "missing_property_id" });
  });

  it("recognizes a single identifier without regard to letter case", () => {
    expect(screenProposal("דירה demo-002, קומה 3")).toEqual({
      status: "ok",
      propertyId: "DEMO-002",
      propertyIdQuote: "demo-002",
    });
  });

  it("counts repeated mentions of the same identifier as one identifier", () => {
    expect(screenProposal("DEMO-001 וגם demo-001")).toEqual({
      status: "ok",
      propertyId: "DEMO-001",
      propertyIdQuote: "DEMO-001",
    });
  });

  it("rejects multiple different identifiers", () => {
    expect(screenProposal("DEMO-001 ו-DEMO-002")).toEqual({
      status: "multiple_property_ids",
      propertyIds: ["DEMO-001", "DEMO-002"],
    });
  });

  it("does not match identifiers embedded in longer alphanumeric strings", () => {
    expect(screenProposal("XDEMO-001 DEMO-001A")).toEqual({ status: "missing_property_id" });
  });

  it("recognizes IDs that are adjacent to Hebrew text", () => {
    expect(screenProposal("דירהDEMO-001בתל אביב")).toEqual({
      status: "ok",
      propertyId: "DEMO-001",
      propertyIdQuote: "DEMO-001",
    });
  });
});
