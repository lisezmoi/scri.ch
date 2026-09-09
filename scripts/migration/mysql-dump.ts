export type SqlValue = string | number | null;

export interface LegacyDrawingRow {
  id: number;
  shortId: string;
  parent: number | null;
  serializedSettings: string | null;
  createdAt: string;
}

function parseValues(source: string): SqlValue[][] {
  const rows: SqlValue[][] = [];
  let offset = 0;
  const expect = (character: string): void => {
    if (source[offset] !== character) {
      throw new Error(`Malformed SQL VALUES at byte ${offset}: expected ${character}`);
    }
    offset++;
  };
  const value = (): SqlValue => {
    if (source.startsWith("NULL", offset)) {
      offset += 4;
      return null;
    }
    if (source[offset] === "'") {
      offset++;
      let result = "";
      while (offset < source.length && source[offset] !== "'") {
        if (source[offset] === "\\") {
          offset++;
          const escaped = source[offset++];
          if (escaped === undefined) throw new Error("Truncated SQL escape");
          result += escaped === "0"
            ? "\0"
            : escaped === "b"
            ? "\b"
            : escaped === "n"
            ? "\n"
            : escaped === "r"
            ? "\r"
            : escaped === "t"
            ? "\t"
            : escaped === "Z"
            ? "\x1a"
            : escaped;
        } else {
          result += source[offset++];
        }
      }
      expect("'");
      return result;
    }
    const start = offset;
    while (/[0-9-]/.test(source[offset] ?? "")) offset++;
    if (start === offset) throw new Error(`Malformed SQL value at byte ${offset}`);
    const result = Number(source.slice(start, offset));
    if (!Number.isSafeInteger(result)) throw new Error("SQL integer is outside the safe range");
    return result;
  };

  while (offset < source.length) {
    expect("(");
    const row: SqlValue[] = [];
    for (let field = 0; field < 5; field++) {
      row.push(value());
      if (field < 4) expect(",");
    }
    expect(")");
    rows.push(row);
    if (source[offset] !== ",") break;
    offset++;
  }
  if (offset !== source.length) throw new Error(`Unexpected SQL after VALUES at byte ${offset}`);
  return rows;
}

export function parseScrichDump(sql: string, assumeScrich = false): LegacyDrawingRow[] {
  const markers = [...sql.matchAll(/^\s*USE\s+`?([a-zA-Z0-9_]+)`?\s*;/gm)];
  const selected = markers.findIndex((marker) => marker[1] === "scrich");
  if (selected < 0 && (markers.length > 0 || !assumeScrich)) {
    throw new Error(
      "The dump does not contain the scrich database; for a single-database dump without USE, pass --database scrich",
    );
  }
  const section = selected < 0
    ? sql
    : sql.slice(markers[selected]!.index, markers[selected + 1]?.index);
  const prefix = "INSERT INTO `drawings` VALUES ";
  const rows: LegacyDrawingRow[] = [];
  let searchOffset = 0;
  for (;;) {
    const statement = section.indexOf(prefix, searchOffset);
    if (statement < 0) break;
    const valuesStart = statement + prefix.length;
    const valuesEnd = section.indexOf(";\n", valuesStart);
    if (valuesEnd < 0) throw new Error("Unterminated drawings INSERT statement");
    for (const fields of parseValues(section.slice(valuesStart, valuesEnd))) {
      const [id, shortId, parent, serializedSettings, createdAt] = fields;
      if (
        typeof id !== "number" || typeof shortId !== "string"
        || (parent !== null && typeof parent !== "number")
        || (serializedSettings !== null && typeof serializedSettings !== "string")
        || typeof createdAt !== "string"
      ) {
        throw new Error("Unexpected drawings row types");
      }
      rows.push({ id, shortId, parent, serializedSettings, createdAt });
    }
    searchOffset = valuesEnd + 2;
  }
  if (rows.length === 0) throw new Error("The scrich dump contains no drawing rows");
  return rows;
}
