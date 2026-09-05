/**
 * Detection deterministe d'une mention d'editeur OT/SCADA connu, pour taguer
 * un evenement comme pertinent pour les systemes industriels -- meme quand
 * il arrive via le flux /avis/ generaliste plutot que via le flux
 * /feed/scada/ dedie (cf. src/collectors/certfr/index.ts).
 *
 * Liste volontairement courte et limitee aux editeurs reellement observes
 * dans de vraies entrees CERT-FR (Siemens, Moxa, Schneider Electric --
 * cf. tests/collectors/certfr-fixtures/scada-feed-real.xml) plutot qu'une
 * liste exhaustive inventee -- a completer au fur et a mesure de vraies
 * observations plutot que d'anticiper.
 */
const OT_VENDOR_PATTERN = /\b(Siemens|Moxa|Schneider Electric)\b/i;

export function detectOtVendor(text: string): boolean {
  return OT_VENDOR_PATTERN.test(text);
}
