import { expect, test } from "bun:test";
import { parseLegacySettings } from "../../scripts/migration/php-serialize";

test("normalizes null and empty settings", () => {
  expect(parseLegacySettings(null)).toEqual({});
  expect(parseLegacySettings("a:0:{}")).toEqual({});
});

test("parses nested drawing settings", () => {
  expect(parseLegacySettings(
    "a:4:{s:10:\"background\";s:4:\"#235\";s:10:\"foreground\";s:4:\"#abb\";s:6:\"margin\";i:22;s:4:\"size\";a:2:{s:5:\"width\";i:677;s:6:\"height\";i:677;}}",
  )).toEqual({
    background: "#235",
    foreground: "#abb",
    margin: 22,
    size: { width: 677, height: 677 },
  });
});
