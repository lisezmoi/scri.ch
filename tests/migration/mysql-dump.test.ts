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

for (const newline of ["\n", "\r\n"]) {
  test(`accepts multiline INSERTs and whitespace with ${JSON.stringify(newline)}`, () => {
    const sql = [
      "USE scrich;",
      "INSERT",
      " INTO `drawings`",
      " VALUES",
      " ( 1 , '1' , NULL , NULL , '2020-01-01 00:00:00' ) ,",
      " (2, '2', 1, NULL, '2020-01-02 00:00:00')",
      ";",
    ].join(newline);
    expect(parseScrichDump(sql)).toEqual([...parseScrichDump(insert, true), {
      id: 2,
      shortId: "2",
      parent: 1,
      serializedSettings: null,
      createdAt: "2020-01-02 00:00:00",
    }]);
  });
}

test("preserves string whitespace, semicolons, SQL-looking text and quote escapes", () => {
  const value =
    "a ;\nUSE other;\nINSERT INTO `drawings` VALUES \n -- not a comment\n/* data */ it's \\ fine";
  const quoted = value.replaceAll("\\", "\\\\").replaceAll("'", "''");
  const sql =
    `-- USE other;\nUSE scrich;\n/* ; */ INSERT INTO drawings VALUES (1,'1',NULL,'${quoted}','2020-01-01 00:00:00');# end`;
  expect(parseScrichDump(sql)[0]?.serializedSettings).toBe(value);
  expect(parseScrichDump(insert.replace("NULL,NULL", "NULL,'it\\'s'"), true)[0]?.serializedSettings)
    .toBe("it's");
});

test("rejects incomplete or unsupported inserts instead of partially importing", () => {
  for (
    const sql of [
      insert.trim().slice(0, -1),
      insert.replace("VALUES", "(id) VALUES"),
      insert.replace(");", "),;"),
      insert.replace("NULL,NULL", "NULL,'unfinished"),
    ]
  ) {
    expect(() => parseScrichDump(sql, true)).toThrow();
  }
});
