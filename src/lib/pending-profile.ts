const KEY = 'obiba:pending-profile';

export interface PendingProfile {
  displayName: string;
  phone: string;
}

export function savePendingProfile(email: string, p: PendingProfile): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email: email.trim().toLowerCase(), ...p }));
  } catch {
    return;
  }
}

export function readPendingProfile(email: string | null | undefined): PendingProfile | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw || !email) return null;
    const v = JSON.parse(raw) as Partial<PendingProfile> & { email?: string };
    if (v.email !== email.trim().toLowerCase()) return null;
    return typeof v.displayName === 'string' && typeof v.phone === 'string' ? { displayName: v.displayName, phone: v.phone } : null;
  } catch {
    return null;
  }
}

export function clearPendingProfile(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
}
