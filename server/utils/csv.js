/**
 * CSV, read the one way this project reads it. Moved out of
 * scripts/importMenu.js in P25 so the platform item mapping import shares it.
 */
/**
 * Splits CSV text into rows of fields, keeping each row's line number. Handles
 * quoted fields with commas, doubled quotes and line breaks inside quotes.
 * Blank lines and lines starting with # are skipped.
 */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let fields = [];
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const source = text.replace(/^﻿/, '');

  const endRow = () => {
    fields.push(field);
    const blank = fields.length === 1 && fields[0].trim() === '';
    const comment = fields[0].trimStart().startsWith('#');
    if (!blank && !comment) rows.push({ line: rowLine, fields: fields.map((value) => value.trim()) });
    field = '';
    fields = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      field += char;
    }
  }
  if (field !== '' || fields.length > 0) endRow();
  return rows;
}

export default { parseCsv };
