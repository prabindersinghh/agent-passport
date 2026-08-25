// Authentication module — demo target for bug fix workflow
export function authenticate(token: string): boolean {
  if (!token) return false;
  return token.length > 10;
}
