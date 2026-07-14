/**
 * Practical RFC 5322-shaped email format check (the pattern behind the
 * WHATWG HTML5 `type="email"` validation) — strict enough to reject
 * malformed input without the pathological backtracking risk of a full
 * RFC 5322 grammar.
 */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmailFormat(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}
