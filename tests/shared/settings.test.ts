import { expect, test } from "bun:test";
import { normalizeSettings, settingsFromQuery } from "../../src/settings";

test("normalizes supported settings", () => {
  expect(normalizeSettings({
    background: "ABC",
    foreground: "#123456",
    margin: 12,
    size: { width: 640, height: 480 },
    ignored: true,
  })).toEqual({
    background: "#abc",
    foreground: "#123456",
    margin: 12,
    size: { width: 640, height: 480 },
  });
});

test("parses legacy URL size forms", () => {
  expect(settingsFromQuery(new URLSearchParams("size=400"))).toEqual({
    size: { width: 400, height: 400 },
  });
  expect(settingsFromQuery(new URLSearchParams("size=400x"))).toEqual({ size: { width: 400 } });
  expect(settingsFromQuery(new URLSearchParams("size=x300"))).toEqual({ size: { height: 300 } });
});

test("rejects unsafe dimensions", () => {
  expect(normalizeSettings({ size: { width: 10_000, height: 10_000 } })).toEqual({});
});

test("query parameter defaults, overrides, and invalid values", () => {
  const cases: [string, object][] = [
    ["", {}],
    ["background=abc&foreground=123456&margin=7&size=120x80", {
      background: "#abc",
      foreground: "#123456",
      margin: 7,
      size: { width: 120, height: 80 },
    }],
    ["background=%23ABC&foreground=%2300FF00", { background: "#abc", foreground: "#00ff00" }],
    ["background=transparent&foreground=red", {}],
    ["background=12&foreground=abcd&margin=-1&size=bad", {}],
    ["margin=0&size=0", {}],
    ["margin=1.5&size=300X200", {}],
    ["margin=32769&size=32769", {}],
    ["size=400x300", { size: { width: 400, height: 300 } }],
    ["size=400x", { size: { width: 400 } }],
    ["size=x300", { size: { height: 300 } }],
    ["size=400x0", { size: { width: 400 } }],
    ["size=0x300", { size: { height: 300 } }],
    ["size=8000x4000", { size: { width: 8000, height: 4000 } }],
    ["size=8000x4001", {}],
    ["background=abc&background=def", { background: "#abc" }],
    ["unknown=anything", {}],
  ];
  for (const [query, expected] of cases) {
    expect(settingsFromQuery(new URLSearchParams(query))).toEqual(expected);
  }
});
