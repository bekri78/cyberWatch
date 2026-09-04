/**
 * Curseur opaque pour la pagination de /api/v1/events et /api/v1/sync
 * (cf. document d'architecture, section 08). Encode une position exacte
 * (valeur de tri + id) plutot qu'un simple timestamp ou un offset : evite
 * les pertes/doublons en cas d'egalite de timestamp, et reste stable meme
 * si des lignes sont inserees pendant la pagination (contrairement a un
 * OFFSET qui peut sauter ou repeter des lignes).
 */
export interface Cursor {
  sortValue: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');
}

export class InvalidCursorError extends Error {
  constructor() {
    super('Curseur invalide');
    this.name = 'InvalidCursorError';
  }
}

export function decodeCursor(raw: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
  } catch {
    throw new InvalidCursorError();
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Partial<Cursor>).sortValue !== 'string' ||
    typeof (parsed as Partial<Cursor>).id !== 'string'
  ) {
    throw new InvalidCursorError();
  }

  return parsed as Cursor;
}
