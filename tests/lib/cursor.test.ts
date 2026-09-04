import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, InvalidCursorError } from '../../src/lib/pagination/cursor';

describe('cursor', () => {
  it('encode puis decode retrouve exactement la meme valeur', () => {
    const original = { sortValue: '2026-09-02T00:00:00.000Z', id: '89d4f1d4-b9d2-48d8-bc1d-8ce000920bc7' };
    expect(decodeCursor(encodeCursor(original))).toEqual(original);
  });

  it('produit une chaine opaque (base64url), pas du JSON lisible directement', () => {
    const encoded = encodeCursor({ sortValue: '2026-01-01T00:00:00.000Z', id: 'abc' });
    expect(encoded).not.toContain('{');
    expect(encoded).not.toContain('sortValue');
  });

  it('rejette un curseur non decodable en base64', () => {
    expect(() => decodeCursor('!!!pas-du-base64!!!')).toThrow(InvalidCursorError);
  });

  it('rejette un curseur qui decode vers un JSON valide mais de forme inattendue', () => {
    const wrongShape = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf-8').toString('base64url');
    expect(() => decodeCursor(wrongShape)).toThrow(InvalidCursorError);
  });

  it('rejette un curseur qui ne decode meme pas vers du JSON', () => {
    const notJson = Buffer.from('ceci n\'est pas du json', 'utf-8').toString('base64url');
    expect(() => decodeCursor(notJson)).toThrow(InvalidCursorError);
  });
});
