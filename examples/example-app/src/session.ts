// Session management
export function createSession(userId: string): string {
  return `session-${userId}-${Date.now()}`;
}
