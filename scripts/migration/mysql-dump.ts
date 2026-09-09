export type SqlValue = string | number | null;

export interface LegacyDrawingRow {
  id: number;
  shortId: string;
  parent: number | null;
  serializedSettings: string | null;
  createdAt: string;
}

const SQL_ESCAPES: Record<string, string> = {
  "0": "\0",
  b: "\b",
  n: "\n",
  r: "\r",
  t: "\t",
  Z: "\x1a",
};

// MySQL dump strings use backslash escapes or doubled quotes.
// Share this rule between statement boundaries and drawing field values.
function quotedEnd(source: string, start: number): number {
  const quote = source[start];
  for (let offset = start + 1; offset < source.length; offset++) {
    if (source[offset] === "\\") offset++;
    else if (source[offset] === quote) {
      if (source[offset + 1] === quote) offset++;
      else return offset + 1;
    }
  }
  throw new Error("Unterminated SQL string");
}

function parseValues(source: string): SqlValue[][] {
  const rows: SqlValue[][] = [];
  let offset = 0;
  const whitespace = () => {
    while (/\s/.test(source[offset] ?? "")) offset++;
  };
  const expect = (character: string): void => {
    whitespace();
    if (source[offset] !== character) {
      throw new Error(`Malformed SQL VALUES at byte ${offset}: expected ${character}`);
    }
    offset++;
  };
  const value = (): SqlValue => {
    whitespace();
    if (source.startsWith("NULL", offset)) {
      offset += 4;
      return null;
    }
    if (source[offset] === "'") {
      const end = quotedEnd(source, offset);
      const quoted = source.slice(offset + 1, end - 1);
      offset = end;
      return quoted.replace(
        /\\([\s\S])|''/g,
        (_, escaped: string | undefined) =>
          escaped === undefined ? "'" : (SQL_ESCAPES[escaped] ?? escaped),
      );
    }
    const start = offset;
    while (/[0-9-]/.test(source[offset] ?? "")) offset++;
    if (start === offset) throw new Error(`Malformed SQL value at byte ${offset}`);
    const result = Number(source.slice(start, offset));
    if (!Number.isSafeInteger(result)) throw new Error("SQL integer is outside the safe range");
    return result;
  };

  whitespace();
  while (offset < source.length) {
    expect("(");
    const row: SqlValue[] = [];
    for (let field = 0; field < 5; field++) {
      row.push(value());
      if (field < 4) expect(",");
    }
    expect(")");
    rows.push(row);
    whitespace();
    if (source[offset] !== ",") break;
    offset++;
    whitespace();
    if (offset === source.length) throw new Error("Trailing comma after SQL row");
  }
  if (offset !== source.length) throw new Error(`Unexpected SQL after VALUES at byte ${offset}`);
  return rows;
}

// Split only outside quoted strings. Comments and line breaks must not alter stored values.
function* sqlStatements(sql: string): Generator<string> {
  let statement = "";
  for (let i = 0; i < sql.length; i++) {
    const character = sql[i]!;
    if (character === "'" || character === "\"" || character === "`") {
      const end = quotedEnd(sql, i);
      statement += sql.slice(i, end);
      i = end - 1;
    } else if (character === "#" || (sql.startsWith("--", i) && /\s/.test(sql[i + 2] ?? ""))) {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? sql.length : end;
      statement += " ";
    } else if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Unterminated SQL comment");
      i = end + 1;
      statement += " ";
    } else if (character === ";") {
      if (statement.trim()) yield statement.trim();
      statement = "";
    } else statement += character;
  }
  if (statement.trim()) throw new Error("Unterminated SQL statement");
}

export function parseScrichDump(sql: string, assumeScrich = false): LegacyDrawingRow[] {
  const statements = [...sqlStatements(sql)];
  const use = /^USE\s+`?([a-zA-Z0-9_]+)`?\s*$/i;
  const hasDatabase = statements.some((statement) => use.test(statement));
  let database: string | undefined = !hasDatabase && assumeScrich ? "scrich" : undefined;
  let foundScrich = database === "scrich";
  const rows: LegacyDrawingRow[] = [];
  for (const statement of statements) {
    const marker = use.exec(statement);
    if (marker) {
      database = marker[1];
      foundScrich ||= database === "scrich";
      continue;
    }
    if (database !== "scrich") continue;
    const insert = /^INSERT\s+INTO\s+(?:`drawings`|drawings)(?=\s|\()/i.exec(statement);
    if (!insert) continue;
    const values = /^\s+VALUES\s*/i.exec(statement.slice(insert[0].length));
    if (!values) {
      throw new Error("Unsupported drawings INSERT; expected VALUES without a column list");
    }
    for (const fields of parseValues(statement.slice(insert[0].length + values[0].length))) {
      const [id, shortId, parent, serializedSettings, createdAt] = fields;
      if (
        typeof id !== "number" || typeof shortId !== "string"
        || (parent !== null && typeof parent !== "number")
        || (serializedSettings !== null && typeof serializedSettings !== "string")
        || typeof createdAt !== "string"
      ) throw new Error("Unexpected drawings row types");
      rows.push({ id, shortId, parent, serializedSettings, createdAt });
    }
  }
  if (!foundScrich) {
    throw new Error(
      "The dump does not contain the scrich database; for a single-database dump without USE, pass --database scrich",
    );
  }
  if (rows.length === 0) throw new Error("The scrich dump contains no drawing rows");
  return rows;
}
