import { describe, expect, test } from "bun:test";
import { decodeShortId, encodeShortId, RESERVED_IDS } from "../../src/id";

describe("base-36 short IDs", () => {
  test("round trips sequential IDs", () => {
    for (const value of [1, 35, 36, 82_459, Number.MAX_SAFE_INTEGER]) {
      expect(decodeShortId(encodeShortId(value))).toBe(value);
    }
  });

  test("rejects malformed and non-canonical IDs", () => {
    for (const value of ["", "A", "01", "hello!", "0"]) {
      expect(() => decodeShortId(value)).toThrow();
    }
  });

  test("reserves application routes", () => {
    expect(RESERVED_IDS.has("about")).toBeTrue();
    expect(RESERVED_IDS.has("gallery")).toBeTrue();
    expect(RESERVED_IDS.has("404")).toBeTrue();
  });
});
