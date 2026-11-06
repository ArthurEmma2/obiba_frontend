const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;

export function validDisplayName(v: string): 'ok' | 'empty' | 'control' {
  const s = v.trim();
  if (s.length === 0 || s.length > 120) return 'empty';
  if (CONTROL.test(s)) return 'control';
  return 'ok';
}

export function validEmail(v: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.trim().length <= 254;
}

export function validHandle(v: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(v);
}

export function normalizeAccountNameInput(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 64);
}

export function validTotpCode(v: string): boolean {
  return /^\d{6}$/.test(v);
}
