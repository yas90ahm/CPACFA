export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status === 401) return 'Your session has expired. Please log in again.';
    if (status === 403) return 'You do not have permission for this action.';
    if (status === 409) return 'This item was modified by another user. Please refresh and try again.';
    if (status === 422) return 'Some fields have invalid values. Please check and try again.';
    if (status >= 500) return 'The server encountered an error. Please try again in a moment.';
  }
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
