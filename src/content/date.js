const CONTENT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?([zZ]|[+-]\d{2}:?\d{2})?)?$/u;

/** @param {number} year @param {number} month @returns {number} */
function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Parse content dates deterministically. Dates without a timezone are UTC.
 * @param {unknown} value
 * @returns {Date|null}
 */
export function parseContentDate(value) {
  const source = String(value ?? "").trim();
  const match = CONTENT_DATE_PATTERN.exec(source);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  const fraction = match[7] || "";
  const zone = match[8] || "Z";

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)
    || hour > 23 || minute > 59 || second > 59) return null;

  if (zone !== "Z" && zone !== "z") {
    const offset = zone.slice(1).replace(":", "");
    const offsetHour = Number(offset.slice(0, 2));
    const offsetMinute = Number(offset.slice(2, 4));
    if (offsetHour > 23 || offsetMinute > 59) return null;
  }

  const milliseconds = fraction ? Number((fraction + "000").slice(0, 3)) : 0;
  const normalizedZone = zone === "z" ? "Z" : zone.length === 5 && zone !== "Z"
    ? `${zone.slice(0, 3)}:${zone.slice(3)}`
    : zone;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}${normalizedZone}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** @param {unknown} value @returns {number} */
export function contentDateTimestamp(value) {
  const date = parseContentDate(value);
  if (!date) throw new Error(`内容 date 格式无效：${String(value ?? "")}`);
  return date.getTime();
}

/**
 * @param {{date: string, slug?: string, key?: string}} left
 * @param {{date: string, slug?: string, key?: string}} right
 */
export function sortNewestFirst(left, right) {
  const dateDifference = contentDateTimestamp(right.date) - contentDateTimestamp(left.date);
  if (dateDifference) return dateDifference;
  const leftKey = String(left.slug || left.key || "");
  const rightKey = String(right.slug || right.key || "");
  return leftKey.localeCompare(rightKey);
}
