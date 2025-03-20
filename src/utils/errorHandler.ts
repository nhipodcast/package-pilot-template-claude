/**
 * Converts any error type to a meaningful error string
 */
export function errorString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
