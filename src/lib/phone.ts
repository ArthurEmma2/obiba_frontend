export function normalizeGhanaPhone(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, '');
  let local: string | null = null;
  if (/^0\d{9}$/.test(compact)) local = compact.slice(1);
  else if (/^\d{9}$/.test(compact)) local = compact;
  else if (/^233\d{9}$/.test(compact)) local = compact.slice(3);
  else if (/^\+233\d{9}$/.test(compact)) local = compact.slice(4);
  if (!local || local.startsWith('0')) return null;
  return `+233${local}`;
}

export function formatGhanaLocal(e164: string): string {
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

export function nationalDigits(e164: string): string {
  const m = /^\+233(\d{9})$/.exec(e164);
  return m ? m[1]! : '';
}
