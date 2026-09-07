import { describe, expect, it } from 'vitest';
import { publicationUrl, qualificationLabel } from './qualification';

describe('qualification', () => {
  it('distingue institution, évaluation IA, attente et échec sans prétendre vérifier les faits', () => {
    expect(qualificationLabel({ qualificationStatus: 'qualified', aiGenerated: false })).toBe('Source institutionnelle');
    expect(qualificationLabel({ qualificationStatus: 'qualified', aiGenerated: true })).toBe('Pertinence évaluée par IA');
    expect(qualificationLabel({ qualificationStatus: 'pending', aiGenerated: false })).toBe('À qualifier');
    expect(qualificationLabel({ qualificationStatus: 'failed', aiGenerated: false })).toBe('Relecture en échec');
    expect(qualificationLabel({ aiGenerated: false })).toBe('Qualification non renseignée');
  });
  it('préserve le lien institutionnel et refuse les protocoles exécutables ou les liens invalides', () => {
    const url = 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-1111/';
    expect(publicationUrl(url)).toBe(url);
    expect(publicationUrl('javascript:alert(1)')).toBeNull();
    expect(publicationUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(publicationUrl('/relative')).toBeNull();
  });
});
