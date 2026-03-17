export const getAuthErrorMessage = (errorCode: string): string => {
  const errorMessages: Record<string, string> = {
    'auth/email-already-in-use': 'This email is already registered',
    'auth/invalid-email': 'Invalid email address',
    'auth/weak-password': 'Password should be at least 6 characters',
    'auth/wrong-password': 'Incorrect password',
    'auth/user-not-found': 'No account found with this email',
    'auth/network-request-failed': 'Network error. Please check your connection',
    'auth/too-many-requests': 'Too many attempts. Please try again later',
    'auth/invalid-credential': 'Invalid email or password',
    'auth/popup-closed-by-user': 'Sign-in was cancelled',
    'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method',
    'auth/operation-not-allowed': 'This operation is not allowed',
    'auth/user-disabled': 'This account has been disabled',
    'auth/requires-recent-login': 'Please sign in again to perform this action',
  };

  return errorMessages[errorCode] || 'An error occurred. Please try again';
};
