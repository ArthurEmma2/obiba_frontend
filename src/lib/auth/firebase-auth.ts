import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  applyActionCode,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  browserLocalPersistence,
  confirmPasswordReset,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  getMultiFactorResolver,
  indexedDBLocalPersistence,
  initializeAuth,
  initializeRecaptchaConfig,
  multiFactor,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  setPersistence,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  validatePassword,
  verifyPasswordResetCode,
  type Auth,
  type MultiFactorError,
  type MultiFactorResolver,
  type PhoneMultiFactorInfo,
  type User,
} from 'firebase/auth';
import { webConfig } from '../config';
import { clearPendingProfile } from '../pending-profile';
import type { AuthService, AuthUser, PasswordCheck, PasswordRule, PhoneEnrollment, ReauthMethod, SecondFactorChallenge, SignInResult, TotpEnrollment } from './types';

interface Challenge extends SecondFactorChallenge {
  resolver: MultiFactorResolver;
  hintUid: string;
  verificationId?: string;
}

function maskPhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `\u2022\u2022\u2022\u2022 ${digits.slice(-4)}` : undefined;
}

function toUser(u: User | null): AuthUser | null {
  if (!u) return null;
  return { uid: u.uid, email: u.email ?? '', emailVerified: u.emailVerified, displayName: u.displayName };
}

export function createFirebaseAuthService(): AuthService {
  let app: FirebaseApp | null = null;
  let auth: Auth | null = null;
  let recaptcha: Promise<void> | null = null;
  let verifier: RecaptchaVerifier | null = null;

  function instance(): Auth {
    if (auth) return auth;
    if (typeof window === 'undefined') throw new Error('Authentication runs in the browser only');
    const cfg = webConfig();
    app = getApps()[0] ?? initializeApp({ apiKey: cfg.firebase.apiKey, authDomain: cfg.firebase.authDomain, projectId: cfg.firebase.projectId });
    let fresh = true;
    try {
      auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver });
    } catch {
      auth = getAuth(app);
      fresh = false;
    }
    if (cfg.firebase.tenantId) auth.tenantId = cfg.firebase.tenantId;
    if (fresh && cfg.authEmulatorUrl && process.env.NODE_ENV !== 'production') connectAuthEmulator(auth, cfg.authEmulatorUrl, { disableWarnings: true });
    auth.useDeviceLanguage();
    return auth;
  }

  function withRecaptcha(): Promise<void> {
    if (recaptcha) return recaptcha;
    const pending = webConfig().authEmulatorUrl
      ? Promise.resolve()
      : initializeRecaptchaConfig(instance()).catch(() => {
          recaptcha = null;
        });
    recaptcha = pending;
    return pending;
  }

  function appVerifier(): RecaptchaVerifier {
    if (verifier) return verifier;
    const a = instance();
    if (webConfig().authEmulatorUrl && process.env.NODE_ENV !== 'production') a.settings.appVerificationDisabledForTesting = true;
    let el = document.getElementById('obiba-recaptcha');
    if (!el) {
      el = document.createElement('div');
      el.id = 'obiba-recaptcha';
      document.body.appendChild(el);
    }
    verifier = new RecaptchaVerifier(a, el, { size: 'invisible' });
    return verifier;
  }

  function resetVerifier(): void {
    verifier?.clear();
    verifier = null;
  }

  async function sendCode(options: Parameters<PhoneAuthProvider['verifyPhoneNumber']>[0]): Promise<string> {
    try {
      return await new PhoneAuthProvider(instance()).verifyPhoneNumber(options, appVerifier());
    } catch (err) {
      resetVerifier();
      throw err;
    }
  }

  function user(): User {
    const u = instance().currentUser;
    if (!u) throw Object.assign(new Error('Not signed in'), { code: 'auth/no-current-user' });
    return u;
  }

  async function secondFactor(err: unknown, purpose: Challenge['purpose']): Promise<SignInResult> {
    if ((err as { code?: string }).code !== 'auth/multi-factor-auth-required') throw err;
    const resolver = getMultiFactorResolver(instance(), err as MultiFactorError);
    const phone = resolver.hints.find((h) => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID) as PhoneMultiFactorInfo | undefined;
    if (phone) {
      const challenge: Challenge = { kind: 'phone', purpose, resolver, hintUid: phone.uid, phoneHint: maskPhone(phone.phoneNumber) };
      challenge.verificationId = await sendCode({ multiFactorHint: phone, session: resolver.session });
      return { status: 'second-factor', challenge };
    }
    const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) throw err;
    const challenge: Challenge = { kind: 'totp', purpose, resolver, hintUid: hint.uid };
    return { status: 'second-factor', challenge };
  }

  function googleProvider(): GoogleAuthProvider {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  }

  function continueUrl(): string {
    return `${webConfig().appOrigin}/onboarding`;
  }

  return {
    current: () => (typeof window === 'undefined' ? null : toUser(instance().currentUser)),

    async ready() {
      const a = instance();
      await a.authStateReady();
      return toUser(a.currentUser);
    },

    onChange(listener) {
      return onIdTokenChanged(instance(), (u) => listener(toUser(u)));
    },

    async idToken(forceRefresh = false) {
      const u = instance().currentUser;
      return u ? u.getIdToken(forceRefresh) : null;
    },

    async authAgeSeconds() {
      const u = instance().currentUser;
      if (!u) return null;
      const r = await u.getIdTokenResult();
      const authTime = Date.parse(r.authTime);
      return Number.isFinite(authTime) ? Math.max(0, Math.floor((Date.now() - authTime) / 1000)) : null;
    },

    async signUp({ email, password, displayName }) {
      await withRecaptcha();
      const cred = await createUserWithEmailAndPassword(instance(), email, password);
      await updateProfile(cred.user, { displayName });
      if (!webConfig().skipOtp) await sendEmailVerification(cred.user, { url: continueUrl() });
    },

    async signIn(email, password) {
      await withRecaptcha();
      try {
        await signInWithEmailAndPassword(instance(), email, password);
        return { status: 'signed-in' };
      } catch (err) {
        return await secondFactor(err, 'sign-in');
      }
    },

    async signInWithGoogle() {
      try {
        await signInWithPopup(instance(), googleProvider());
        return { status: 'signed-in' };
      } catch (err) {
        return await secondFactor(err, 'sign-in');
      }
    },

    async completeSecondFactor(challenge, code) {
      const c = challenge as Challenge;
      if (c.kind === 'phone') {
        if (!c.verificationId) throw Object.assign(new Error('No code was sent'), { code: 'auth/code-expired' });
        await c.resolver.resolveSignIn(PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(c.verificationId, code)));
      } else {
        await c.resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(c.hintUid, code));
      }
      await instance().currentUser?.getIdToken(true);
    },

    async resendSecondFactor(challenge) {
      const c = challenge as Challenge;
      if (c.kind !== 'phone') return;
      const hint = c.resolver.hints.find((h) => h.uid === c.hintUid);
      if (!hint) throw Object.assign(new Error('Second factor missing'), { code: 'auth/session-expired' });
      c.verificationId = await sendCode({ multiFactorHint: hint, session: c.resolver.session });
    },

    async reauthenticate(password) {
      const u = user();
      try {
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? '', password));
        await u.getIdToken(true);
        return { status: 'signed-in' };
      } catch (err) {
        return await secondFactor(err, 'reauth');
      }
    },

    async reauthenticateWithGoogle() {
      const u = user();
      try {
        await reauthenticateWithPopup(u, googleProvider());
        await u.getIdToken(true);
        return { status: 'signed-in' };
      } catch (err) {
        return await secondFactor(err, 'reauth');
      }
    },

    reauthMethods() {
      const u = instance().currentUser;
      const ids = new Set((u?.providerData ?? []).map((p) => p.providerId));
      const methods: ReauthMethod[] = [];
      if (ids.has('password')) methods.push('password');
      if (ids.has('google.com')) methods.push('google');
      return methods.length ? methods : ['password'];
    },

    async sendVerification() {
      await sendEmailVerification(user(), { url: continueUrl() });
    },

    async refreshVerification() {
      const u = user();
      await u.reload();
      if (!u.emailVerified) return false;
      await u.getIdToken(true);
      return true;
    },

    async sendPasswordReset(email) {
      await withRecaptcha();
      try {
        await sendPasswordResetEmail(instance(), email, { url: `${webConfig().appOrigin}/sign-in` });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'auth/user-not-found' || code === 'auth/invalid-email') return;
        throw err;
      }
    },

    checkResetCode: (code) => verifyPasswordResetCode(instance(), code),

    confirmReset: (code, newPassword) => confirmPasswordReset(instance(), code, newPassword),

    async applyEmailCode(code) {
      await applyActionCode(instance(), code);
      const u = instance().currentUser;
      if (u) {
        await u.reload();
        await u.getIdToken(true);
      }
    },

    async checkPassword(password) {
      try {
        const status = await validatePassword(instance(), password);
        const p = status.passwordPolicy.customStrengthOptions;
        const rules: PasswordRule[] = [];
        if (p.minPasswordLength !== undefined) rules.push({ id: 'min', met: status.meetsMinPasswordLength !== false, value: p.minPasswordLength });
        if (p.maxPasswordLength !== undefined) rules.push({ id: 'max', met: status.meetsMaxPasswordLength !== false, value: p.maxPasswordLength });
        if (p.containsLowercaseLetter) rules.push({ id: 'lower', met: status.containsLowercaseLetter === true });
        if (p.containsUppercaseLetter) rules.push({ id: 'upper', met: status.containsUppercaseLetter === true });
        if (p.containsNumericCharacter) rules.push({ id: 'number', met: status.containsNumericCharacter === true });
        if (p.containsNonAlphanumericCharacter) rules.push({ id: 'symbol', met: status.containsNonAlphanumericCharacter === true });
        const check: PasswordCheck = { valid: status.isValid, rules };
        return check;
      } catch {
        return null;
      }
    },

    totpEnrolled() {
      const u = instance().currentUser;
      return !!u && multiFactor(u).enrolledFactors.some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    },

    phoneEnrolled() {
      const u = instance().currentUser;
      return !!u && multiFactor(u).enrolledFactors.some((f) => f.factorId === PhoneMultiFactorGenerator.FACTOR_ID);
    },

    secondFactorEnrolled() {
      const u = instance().currentUser;
      return !!u && multiFactor(u).enrolledFactors.some((f) => f.factorId === PhoneMultiFactorGenerator.FACTOR_ID || f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    },

    async startPhoneEnrollment(phoneNumber): Promise<PhoneEnrollment> {
      const u = user();
      const session = await multiFactor(u).getSession();
      const verificationId = await sendCode({ phoneNumber, session });
      return {
        phoneNumber,
        async finish(code: string) {
          await multiFactor(u).enroll(PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(verificationId, code)), 'Mobile');
          await u.getIdToken(true);
        },
      };
    },

    async startTotpEnrollment(): Promise<TotpEnrollment> {
      if (webConfig().authEmulatorUrl) throw Object.assign(new Error('The Auth emulator supports SMS second factors only'), { code: 'auth/operation-not-allowed' });
      const u = user();
      const session = await multiFactor(u).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      return {
        secretKey: secret.secretKey,
        otpauthUrl: secret.generateQrCodeUrl(u.email ?? u.uid, 'Obiba'),
        async finish(code: string) {
          const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
          await multiFactor(u).enroll(assertion, 'Authenticator app');
          await u.getIdToken(true);
        },
      };
    },

    async setSharedComputer(shared) {
      await setPersistence(instance(), shared ? browserSessionPersistence : indexedDBLocalPersistence);
    },

    async signOut() {
      clearPendingProfile();
      await signOut(instance());
    },
  };
}
