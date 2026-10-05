/*
 * French typography for a text written with plain spaces: a narrow no-break
 * space (U+202F) before ! ? and ;, a no-break space (U+00A0) before : and
 * inside « », so that the sign never starts a line on its own. fr.json is
 * written with them; longer French texts in code (the legal pages) go
 * through this, the escapes being unreadable there.
 */
export default function frenchTypography(text) {
  return text
    .replace(/ ([!?;])/g, ' $1')
    .replace(/ :(?=\s|$)/gm, ' :')
    .replace(/« /g, '« ')
    .replace(/ »/g, ' »');
}
