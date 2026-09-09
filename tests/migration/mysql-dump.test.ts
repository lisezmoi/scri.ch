import { expect, test } from "bun:test";
import { parseScrichDump } from "../../scripts/migration/mysql-dump";
const insert = "INSERT INTO `drawings` VALUES (1,'1',NULL,NULL,'2020-01-01 00:00:00');\n";
test("requires explicit database selection for a dump without USE", () => {
  expect(() => parseScrichDump(insert)).toThrow("--database scrich");
  expect(parseScrichDump(insert, true)).toHaveLength(1);
});
test("accepts quoted and unquoted USE and stops at the next database", () => {
  for (const marker of ["USE `scrich`;", "USE scrich;"]) {
    expect(parseScrichDump(`${marker}\n${insert}USE other;\n${insert}`)).toHaveLength(1);
  }
});
test("explicit fallback cannot select a different named database", () => {
  expect(() => parseScrichDump(`USE other;\n${insert}`, true)).toThrow("does not contain");
});
