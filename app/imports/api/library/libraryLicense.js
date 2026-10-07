/*
 * The licence a library's content is under, set by its owner: the first link
 * of its provenance, which what is copied from it inherits (a party board's
 * monster shows it, from its template's library). The SRDs are under
 * Creative Commons Attribution 4.0: the About page carries their attribution
 * statement and the note of what DiceCloud changed (#licenses), which a
 * library's licence and a monster's footer link to. Libraries made before the
 * field have none (there is no migration framework).
 */
export const LIBRARY_LICENSES = Object.freeze(['srd-5.1', 'srd-5.2.1', 'original', 'other-open', 'private']);

// The licence's own short name, the same in every language
const SRD_LICENSES = Object.freeze({
  'srd-5.1': 'SRD 5.1 · CC BY 4.0',
  'srd-5.2.1': 'SRD 5.2.1 · CC BY 4.0',
});

// Where the attribution statements are: the About page's section
export const LICENSES_ROUTE = '/about#licenses';

/** Whether the licence is one of the SRDs', whose attribution the About page holds */
export function isSrdLicense(license) {
  return license in SRD_LICENSES;
}

/**
 * The licence's short label: "SRD 5.1 · CC BY 4.0", else the message of
 * `library.licenses.<licence>` through `t`; undefined without a licence
 */
export function licenseLabel(license, t) {
  if (!LIBRARY_LICENSES.includes(license)) return undefined;
  return SRD_LICENSES[license] || t(`library.licenses.${license}`);
}
