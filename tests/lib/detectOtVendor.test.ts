import { describe, expect, it } from 'vitest';
import { detectOtVendor } from '../../src/lib/text/detectOtVendor';

describe('detectOtVendor', () => {
  it('detecte Siemens (vraie entree CERT-FR, flux scada)', () => {
    expect(detectOtVendor('Multiples vulnérabilités dans les produits Siemens (09 juin 2026)')).toBe(true);
  });

  it('detecte Moxa (vraie entree CERT-FR, flux scada)', () => {
    expect(detectOtVendor('Vulnérabilité dans les produits Moxa (12 juin 2026)')).toBe(true);
  });

  it('detecte Schneider Electric (vraie entree CERT-FR, flux scada)', () => {
    expect(detectOtVendor('Vulnérabilité dans Schneider Electric EcoStruxure (15 juillet 2026)')).toBe(true);
  });

  it('ne detecte rien pour un texte sans editeur OT connu', () => {
    expect(detectOtVendor('Une vulnérabilité a été découverte dans SPIP.')).toBe(false);
  });

  it('est insensible a la casse', () => {
    expect(detectOtVendor('vulnerabilites dans les produits SIEMENS')).toBe(true);
  });
});
