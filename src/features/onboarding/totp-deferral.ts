const key = (uid: string) => `obiba:totp-later:${uid}`;

export function isTotpDeferred(uid: string): boolean {
  try {
    return localStorage.getItem(key(uid)) === '1';
  } catch {
    return false;
  }
}

export function deferTotp(uid: string): void {
  try {
    localStorage.setItem(key(uid), '1');
  } catch {
    return;
  }
}

export function clearTotpDeferral(uid: string): void {
  try {
    localStorage.removeItem(key(uid));
  } catch {
    return;
  }
}
