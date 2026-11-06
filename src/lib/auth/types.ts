export interface AuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

export interface SecondFactorChallenge {
  readonly kind: 'totp' | 'phone';
  readonly purpose: 'sign-in' | 'reauth';
  readonly phoneHint?: string;
}

export type SignInResult = { status: 'signed-in' } | { status: 'second-factor'; challenge: SecondFactorChallenge };

export interface PasswordRule {
  id: 'min' | 'max' | 'lower' | 'upper' | 'number' | 'symbol';
  met: boolean;
  value?: number;
}

export interface PasswordCheck {
  valid: boolean;
  rules: PasswordRule[];
}

export interface TotpEnrollment {
  secretKey: string;
  otpauthUrl: string;
  finish(code: string): Promise<void>;
}

export interface PhoneEnrollment {
  phoneNumber: string;
  finish(code: string): Promise<void>;
}

export type ReauthMethod = 'password' | 'google';

export interface AuthService {
  current(): AuthUser | null;
  ready(): Promise<AuthUser | null>;
  onChange(listener: (user: AuthUser | null) => void): () => void;
  idToken(forceRefresh?: boolean): Promise<string | null>;
  authAgeSeconds(): Promise<number | null>;
  signUp(input: { email: string; password: string; displayName: string }): Promise<void>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signInWithGoogle(): Promise<SignInResult>;
  completeSecondFactor(challenge: SecondFactorChallenge, code: string): Promise<void>;
  resendSecondFactor(challenge: SecondFactorChallenge): Promise<void>;
  reauthenticate(password: string): Promise<SignInResult>;
  reauthenticateWithGoogle(): Promise<SignInResult>;
  reauthMethods(): ReauthMethod[];
  sendVerification(): Promise<void>;
  refreshVerification(): Promise<boolean>;
  sendPasswordReset(email: string): Promise<void>;
  checkResetCode(code: string): Promise<string>;
  confirmReset(code: string, newPassword: string): Promise<void>;
  applyEmailCode(code: string): Promise<void>;
  checkPassword(password: string): Promise<PasswordCheck | null>;
  totpEnrolled(): boolean;
  phoneEnrolled(): boolean;
  secondFactorEnrolled(): boolean;
  startPhoneEnrollment(phoneNumber: string): Promise<PhoneEnrollment>;
  startTotpEnrollment(): Promise<TotpEnrollment>;
  signOut(): Promise<void>;
  setSharedComputer(shared: boolean): Promise<void>;
}
