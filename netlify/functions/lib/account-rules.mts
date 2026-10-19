/* REXUS v2.2.2 — shared account field rules (ACC-01 / ACC-03).
   Username: 3–32 characters; lowercase letters, digits, dot, underscore or hyphen;
   must start and end with a letter or digit. Unique case-insensitively, deleted accounts included
   (their usernames stay reserved so history and audit logs stay unambiguous). */
export const USERNAME_RULE = 'Username must be 3–32 characters: lowercase letters, digits, dot, underscore or hyphen, starting and ending with a letter or digit.';
export function usernameError(u: string): string | null {
  return /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/.test(u) ? null : USERNAME_RULE;
}
export function emailError(e: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? null : 'Please enter a valid email address.';
}
/** Returns an error message when the username or email is already used by another account. */
export async function takenError(db: any, field: 'username' | 'email', value: string, exceptId: string | null): Promise<string | null> {
  const rows = field === 'username'
    ? await db.sql`SELECT id FROM users WHERE LOWER(username) = LOWER(${value}) AND id <> ${exceptId || ''}`
    : await db.sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${value}) AND id <> ${exceptId || ''}`;
  return rows.length ? (field === 'username' ? 'This username is already taken.' : 'An account with this email already exists.') : null;
}
/** v2.3.0 password policy (F07): at least 8 characters with a letter and a digit. */
export const PASSWORD_RULE = 'Password must be at least 8 characters and contain a letter and a digit.';
export function passwordPolicyError(p: string): string | null {
  return p.length >= 8 && p.length <= 200 && /[A-Za-z]/.test(p) && /\d/.test(p) ? null : PASSWORD_RULE;
}
