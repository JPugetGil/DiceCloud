import { Meteor } from 'meteor/meteor';
import {
  COMPONENT, IS_COMPONENTS_V2, LINK_BUTTON, discordMessages, logComponents, translatorFor, type DiscordLanguage,
} from '/imports/api/creature/log/discord/discordMessages';
import { escapeMarkdown } from '/imports/api/creature/log/discord/partyMessages';
import type { LoggedEntry } from '/imports/api/discord/server/interactions/interactionOrigin';

/*
 * What DiceCloud answers an interaction with (D6, D7), in the language of
 * whoever ran it (`locale`: French for fr, else English): a log entry as the
 * card of D3, its character's name on it and the buttons of D7 under it;
 * short texts, for that user alone unless said otherwise. Never anyone
 * mentioned.
 */

export const EPHEMERAL = 1 << 6;

// https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type
export const RESPONSE = {
  pong: 1,
  message: 4,
  deferredMessage: 5,
  deferredUpdate: 6,
  updateMessage: 7,
  autocomplete: 8,
} as const;

// Button styles: primary, secondary
export const BUTTON_STYLE = { primary: 1, secondary: 2 } as const;

const NO_MENTIONS = { allowed_mentions: { parse: [] } };

/** The language of a reply: the interaction's user's */
export function interactionLanguage(locale?: unknown): DiscordLanguage {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** A text of `discord.interactions` in the language */
export function say(language: DiscordLanguage, key: string, params: Record<string, string | number> = {}): string {
  return translatorFor(language)(`discord.interactions.${key}`, params) ?? key;
}

/** A plain text, for the user alone unless `ephemeral` is false */
export function textMessage(content: string, { ephemeral = true, components }: { ephemeral?: boolean, components?: unknown[] } = {}) {
  return { content, ...ephemeral && { flags: EPHEMERAL }, ...components && { components }, ...NO_MENTIONS };
}

/** The answer to someone whose Discord account is linked to no DiceCloud account */
export function notLinkedMessage(language: DiscordLanguage) {
  return textMessage(say(language, 'notLinked'), {
    components: [{
      type: COMPONENT.actionRow,
      components: [{ type: COMPONENT.button, style: LINK_BUTTON, url: Meteor.absoluteUrl('account'), label: say(language, 'openAccount') }],
    }],
  });
}

export type ReplyButton = { label: string, customId: string, style?: number };

const button = ({ label, customId, style = BUTTON_STYLE.secondary }: ReplyButton) => ({
  type: COMPONENT.button, style, label: label.slice(0, 80), custom_id: customId,
});

/** Puts buttons under a card of D3 (logComponents), beside its link to the sheet */
export function addButtons<T extends { components: unknown[] }>(card: T, buttons: ReplyButton[]): T {
  if (!buttons.length) return card;
  const container = card.components[0] as { components: Record<string, any>[] };
  let row = container.components.find(component => component.type === COMPONENT.actionRow);
  if (!row) {
    row = { type: COMPONENT.actionRow, components: [] };
    container.components.push(row);
  }
  row.components.push(...buttons.map(button));
  return card;
}

/**
 * A log entry as a reply: the card of D3 (or its embeds, for an entry too
 * long for one card) with the character's name, which an interaction's
 * message does not carry as a webhook's does, and the buttons under it. The
 * message of an edit: its being for the user alone was decided when the
 * reply was deferred
 */
export function logMessage({ log, creature, language, buttons = [] }: {
  log: LoggedEntry,
  creature: { _id: string, name?: string, color?: string, picture?: string, avatarPicture?: string },
  language: DiscordLanguage,
  buttons?: ReplyButton[],
}): Record<string, unknown> {
  const input = { log, creature, language, sheetUrl: Meteor.absoluteUrl(`character/${creature._id}`) };
  const byline = creature.name?.trim() ? `**${escapeMarkdown(creature.name.trim())}**` : '';
  const card = logComponents(input);
  if (card) {
    const container = card.components[0] as { components: Record<string, any>[] };
    const first = container.components[0];
    const heading = first.type === COMPONENT.section ? first.components[0] : first;
    if (byline) heading.content = `${byline}\n${heading.content}`;
    addButtons(card, buttons);
    return { flags: IS_COMPONENTS_V2, components: card.components, ...NO_MENTIONS };
  }
  const [first] = discordMessages(input);
  const embeds = (first?.embeds || []).map((embed, i) => i === 0 && byline
    ? { ...embed, description: `${byline}\n${embed.description || ''}`.slice(0, 4096) } : embed);
  return {
    embeds,
    components: [{
      type: COMPONENT.actionRow,
      components: [
        { type: COMPONENT.button, style: LINK_BUTTON, url: input.sheetUrl, label: translatorFor(language)('discord.openSheet', {}) || 'Open sheet' },
        ...buttons.map(button),
      ],
    }],
    ...NO_MENTIONS,
  };
}
