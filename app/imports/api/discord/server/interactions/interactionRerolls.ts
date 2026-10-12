import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import type { DiscordLanguage } from '/imports/api/creature/log/discord/discordMessages';
import { BUTTON_STYLE, say, type ReplyButton } from '/imports/api/discord/server/interactions/interactionReplies';

/*
 * What a "Reroll with advantage" button rolls again (D7): a check, a saving
 * throw, or a roll typed with a single d20, of a character; under a command's
 * reply, or under a check or a saving throw made in DiceCloud and posted by a
 * webhook DiceCloud's application owns (discordWebhooks.ts). Kept here, on the
 * server, under an id that the button's custom_id carries with the
 * advantage: the custom_id is never trusted for anything else, and the
 * character and the rights are read again at each click. Kept 30 days, then
 * the button says it is no longer current.
 */

export type Reroll = {
  _id: string,
  creatureId: string,
  kind: 'roll' | 'check',
  // A roll typed: its formula
  roll?: string,
  // A check or a saving throw: its variables
  skillVariableName?: string,
  abilityVariableName?: string,
  // Its first reply was for its user alone
  secret: boolean,
  createdAt: Date,
};

export const REROLL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** The rolls the buttons roll again. Server only */
export const DiscordRerolls = new Mongo.Collection<Reroll>('discordRerolls');

if (Meteor.isServer) {
  Meteor.startup(async () => {
    await DiscordRerolls.rawCollection().createIndex({ createdAt: 1 }, { expireAfterSeconds: REROLL_LIFETIME_MS / 1000 });
  });
}

/** A roll typed with a single d20, which advantage applies to */
export function singleD20(formula: string): boolean {
  const dice = formula.match(/\d*d20(?!\d)/gi) || [];
  return dice.length === 1 && /^1?d20$/i.test(dice[0]);
}

/** Keeps what the buttons roll again; returns the id their custom_id carries */
export async function saveReroll(reroll: Omit<Reroll, '_id' | 'createdAt'>): Promise<string> {
  const _id = Random.id();
  await DiscordRerolls.insertAsync({ ...reroll, _id, createdAt: new Date() });
  return _id;
}

/** The two buttons of a roll kept, in a language: several messages may share them */
export function rerollButtonsOf(rerollId: string, language: DiscordLanguage): ReplyButton[] {
  return [
    { label: say(language, 'buttons.rerollAdvantage'), customId: `dc:reroll:${rerollId}:1`, style: BUTTON_STYLE.primary },
    { label: say(language, 'buttons.rerollDisadvantage'), customId: `dc:reroll:${rerollId}:-1`, style: BUTTON_STYLE.secondary },
  ];
}

/** The two buttons under a check, a saving throw or a single d20, for the roll they roll again */
export async function rerollButtons(reroll: Omit<Reroll, '_id' | 'createdAt'>, language: DiscordLanguage): Promise<ReplyButton[]> {
  return rerollButtonsOf(await saveReroll(reroll), language);
}

/** The roll a button names, while it is kept */
export async function findReroll(rerollId: string): Promise<Reroll | undefined> {
  const reroll = await DiscordRerolls.findOneAsync(rerollId);
  if (!reroll || Date.now() - reroll.createdAt.getTime() > REROLL_LIFETIME_MS) return undefined;
  return reroll;
}
