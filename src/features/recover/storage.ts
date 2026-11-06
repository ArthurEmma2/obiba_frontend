const KEY = 'obiba-restore';

export interface SavedRestore {
  caseId: string;
  statusToken: string;
  uid: string;
}

export function saveRestore(r: SavedRestore): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    return;
  }
}

export function loadRestore(): SavedRestore | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedRestore>;
    return typeof v.caseId === 'string' && typeof v.statusToken === 'string' && typeof v.uid === 'string' ? (v as SavedRestore) : null;
  } catch {
    return null;
  }
}

export function clearRestore(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
}

const EMAIL_KEY = 'obiba-restore-email';

export function rememberRestoreEmail(email: string): void {
  try {
    sessionStorage.setItem(EMAIL_KEY, email);
  } catch {
    return;
  }
}

export function restoreEmail(): string {
  try {
    return sessionStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}
