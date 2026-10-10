import { colorNumber, translatorFor, discordLanguage, COMPONENT, LINK_BUTTON } from '/imports/api/creature/log/discord/discordMessages';

/*
 * What a link to DiceCloud shows when it is pasted in Discord or elsewhere
 * (D1): the Open Graph and Twitter tags of the page's HTML, its theme-color,
 * and for Discord a component embed, a Components V2 card. The crawlers run
 * no script, so the server writes them into the HTML it sends
 * (server/linkPreviews.ts). A public character shows its name, race, class
 * and level, portrait, hit points and armor class; a public library its name
 * and description. Anything else, a private character included, shows only
 * DiceCloud's own preview: nothing of it. Pure.
 */

// https://docs.discord.com/developers/link-previews/overview: beyond these,
// Discord trims a title or a description, and drops a component embed
export const PREVIEW_LIMITS = {
  titleBytes: 70,
  descriptionBytes: 350,
  componentEmbedBytes: 3000,
};

export const SITE_NAME = 'DiceCloud';
// The logo, in public/
export const SITE_IMAGE = { path: 'crown-dice-logo-cropped-transparent.png', width: 260, height: 260 };

export type Preview = {
  title: string,
  description: string,
  // The page's canonical address
  url: string,
  image?: { url: string, width?: number, height?: number },
  // #rrggbb: the accent of Discord's preview
  themeColor?: string,
  // 'summary' shows the image as a thumbnail beside the text
  card?: 'summary' | 'summary_large_image',
  type?: 'website' | 'profile',
  // Discord's Components V2 card for the page
  componentEmbed?: Record<string, unknown>,
};

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;

/** Text cut to at most `maxBytes` bytes of UTF-8, ending with an ellipsis when cut */
export function truncateBytes(text: string, maxBytes: number): string {
  // On one line; the no-break spaces of French typography stay
  const clean = text.replace(/[ \t\r\n]+/g, ' ').trim();
  if (byteLength(clean) <= maxBytes) return clean;
  // By code point, so that no character is cut in two
  const chars = [...clean];
  let size = byteLength('…');
  let end = 0;
  while (end < chars.length && size + byteLength(chars[end]) <= maxBytes) {
    size += byteLength(chars[end]);
    end += 1;
  }
  return chars.slice(0, end).join('').trimEnd() + '…';
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * JSON that stays inside its <script>: no "</script>" can close it early. The
 * escapes count towards Discord's 3,000 bytes, as written
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const isHttpUrl = (url?: string) => !!url && /^https?:\/\/\S+$/i.test(url);

/** A colour as #rrggbb, the only form theme-color takes besides #rrggbbaa */
export function hexColor(color?: string): string | undefined {
  const number = colorNumber(color);
  return number === undefined ? undefined : `#${number.toString(16).padStart(6, '0')}`;
}

/** The tags of a preview, for the HTML's head */
export function previewHead(preview: Preview): string {
  const meta = (attribute: 'property' | 'name', key: string, content?: string | number) => content === undefined || content === ''
    ? '' : `<meta ${attribute}="${key}" content="${escapeHtml(String(content))}" data-link-preview>`;
  const tags = [
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:type', preview.type || 'website'),
    meta('property', 'og:title', preview.title),
    meta('property', 'og:description', preview.description),
    meta('property', 'og:url', preview.url),
    ...preview.image ? [
      meta('property', 'og:image', preview.image.url),
      meta('property', 'og:image:width', preview.image.width),
      meta('property', 'og:image:height', preview.image.height),
    ] : [],
    meta('name', 'twitter:card', preview.card || 'summary'),
    meta('name', 'twitter:title', preview.title),
    meta('name', 'twitter:description', preview.description),
    // After the page's own: the last one gives the colour
    meta('name', 'theme-color', preview.themeColor),
  ];
  if (preview.componentEmbed) {
    const json = scriptJson(preview.componentEmbed);
    if (byteLength(json) <= PREVIEW_LIMITS.componentEmbedBytes) {
      tags.push(`<script id="discord:component-embed" type="application/json" data-link-preview>${json}</script>`);
    }
  }
  return tags.filter(Boolean).join('\n');
}

/**
 * DiceCloud's own preview: any page but a public character's or library's.
 * Its address is the site's, not the page's: nothing of a private character
 */
export function sitePreview({ siteUrl, language }: { siteUrl: string, language?: string }): Preview {
  const translate = translatorFor(discordLanguage(language));
  return {
    title: SITE_NAME,
    description: truncateBytes(translate('linkPreview.siteDescription', {}) || '', PREVIEW_LIMITS.descriptionBytes),
    url: siteUrl,
    image: { url: new URL(SITE_IMAGE.path, siteUrl).href, width: SITE_IMAGE.width, height: SITE_IMAGE.height },
  };
}

export type CharacterSummary = {
  creature: { name?: string, color?: string, picture?: string, avatarPicture?: string },
  race?: string,
  // In the sheet's order
  classes?: { name?: string, level?: number }[],
  hitPoints?: { value?: number, total?: number },
  armorClass?: number,
  language?: string,
};

/** "Level 5 · Fighter 3, Wizard 2", as the character list writes it */
export function levelText(classes: CharacterSummary['classes'] = [], language?: string): string {
  const translate = translatorFor(discordLanguage(language));
  const level = classes.reduce((sum, cls) => sum + (cls.level || 0), 0);
  // A class's own level only tells something once there are several
  const names = classes
    .map(cls => classes.length > 1 && cls.level ? `${cls.name}\u00a0${cls.level}` : cls.name)
    .filter(Boolean).join(', ');
  if (!level) return names;
  return names
    ? translate('characterList.levelClasses', { level, classes: names }) || names
    : translate('characterList.level', { level }) || '';
}

/** A public character's preview: name, race, class and level, portrait, hit points and armor class */
export function characterPreview(summary: CharacterSummary, { siteUrl, url }: { siteUrl: string, url: string }): Preview {
  const { creature, race, classes, hitPoints, armorClass, language } = summary;
  const translate = translatorFor(discordLanguage(language));
  const name = creature.name?.trim() || translate('linkPreview.unnamed', {}) || SITE_NAME;
  const description = [race?.trim(), levelText(classes, language)].filter(Boolean).join(' · ');
  const stats = [
    Number.isFinite(hitPoints?.total) && hitPoints?.total
      ? translate('linkPreview.hitPoints', { value: hitPoints.value ?? hitPoints.total, total: hitPoints.total }) : '',
    Number.isFinite(armorClass) ? translate('linkPreview.armorClass', { ac: armorClass as number }) : '',
  ].filter(Boolean).join(' · ');
  const picture = [creature.picture, creature.avatarPicture].find(isHttpUrl);
  const themeColor = hexColor(creature.color);
  const preview: Preview = {
    title: truncateBytes(name, PREVIEW_LIMITS.titleBytes),
    description: truncateBytes([description, stats].filter(Boolean).join(' — ') || SITE_NAME, PREVIEW_LIMITS.descriptionBytes),
    url,
    type: 'profile',
    card: 'summary',
    ...picture ? { image: { url: picture } } : {
      image: { url: new URL(SITE_IMAGE.path, siteUrl).href, width: SITE_IMAGE.width, height: SITE_IMAGE.height },
    },
    ...themeColor && { themeColor },
  };

  // The card: the name, what the character is and its stats beside its
  // portrait, and a button to the sheet, in the character's colour
  const text = (content: string) => ({ type: COMPONENT.textDisplay, content });
  const cardText = (nameMax: number, lineMax: number) => [
    `### ${truncateBytes(name, nameMax)}`,
    description && truncateBytes(description, lineMax),
    stats,
  ].filter(Boolean).join('\n');
  const card = (nameMax: number, lineMax: number) => ({
    type: COMPONENT.container,
    ...themeColor && { accent_color: colorNumber(themeColor) },
    components: [
      picture
        ? { type: COMPONENT.section, components: [text(cardText(nameMax, lineMax))], accessory: { type: COMPONENT.thumbnail, media: { url: picture } } }
        : text(cardText(nameMax, lineMax)),
      {
        type: COMPONENT.actionRow,
        components: [{ type: COMPONENT.button, style: LINK_BUTTON, label: translate('discord.openSheet', {}) || 'Open sheet', url }],
      },
    ],
  });
  // Within Discord's 3,000 bytes, the texts shortened if need be
  let embed = card(256, 512);
  if (byteLength(scriptJson(embed)) > PREVIEW_LIMITS.componentEmbedBytes) embed = card(100, 200);
  if (byteLength(scriptJson(embed)) <= PREVIEW_LIMITS.componentEmbedBytes) preview.componentEmbed = embed;
  return preview;
}

/** A public library's preview: its name and description */
export function libraryPreview({ name, description }: { name?: string, description?: string }, {
  siteUrl, url, language,
}: { siteUrl: string, url: string, language?: string }): Preview {
  const site = sitePreview({ siteUrl, language });
  // Its description is markdown: the plain words
  const plain = (description || '').replace(/[#*_`>~|[\]]/g, '').replace(/\(https?:\/\/[^)]*\)/g, '');
  return {
    ...site,
    url,
    title: truncateBytes(name?.trim() || SITE_NAME, PREVIEW_LIMITS.titleBytes),
    description: truncateBytes(plain || site.description, PREVIEW_LIMITS.descriptionBytes),
  };
}
