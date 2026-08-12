// Shared form validation helpers for the auth screens.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export const PASSWORD_RULES = {
  minLength: 8,
  hasUpper: /[A-Z]/,
  hasLower: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSymbol: /[^A-Za-z0-9]/,
} as const;

export function passwordRuleStatus(password: string) {
  return {
    length: password.length >= PASSWORD_RULES.minLength,
    upper: PASSWORD_RULES.hasUpper.test(password),
    lower: PASSWORD_RULES.hasLower.test(password),
    number: PASSWORD_RULES.hasNumber.test(password),
    symbol: PASSWORD_RULES.hasSymbol.test(password),
  };
}

export function isStrongPassword(password: string): boolean {
  const s = passwordRuleStatus(password);
  return s.length && s.upper && s.lower && s.number && s.symbol;
}

export function isRequired(value: string): boolean {
  return value.trim().length > 0;
}
