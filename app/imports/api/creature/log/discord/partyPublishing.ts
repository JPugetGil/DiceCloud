/*
 * What a party publishes on its Discord channel, which its game master
 * chooses on the board: everything, with a switch that turns it all off
 * without forgetting the webhook, and one per kind of message. Each is on
 * unless turned off: a webhook just set publishes everything. Shared by the
 * client and the server.
 */

// The kinds of messages, in the order the board lists them:
// - initiative: the initiative message, edited at each turn and change
// - turns: the line that says whose turn it is
// - combat: the start of a fight, and its end with the summary
// - rolls: the rolls and actions of the party's characters
// - sessions: "New session", its forum post or header message
export const PUBLISH_KINDS = Object.freeze(['initiative', 'turns', 'combat', 'rolls', 'sessions'] as const);
export type PublishKind = typeof PUBLISH_KINDS[number];

export type PartyDiscord = {
  webhook?: string,
  // false: nothing is posted, the webhook stays
  enabled?: boolean,
  // By kind, false for those turned off
  publish?: Partial<Record<PublishKind, boolean>>,
};

/** Whether the party posts on: a webhook, publishing on, and that kind on */
export function publishes(discord: PartyDiscord | undefined | null, kind?: PublishKind): boolean {
  if (!discord?.webhook || discord.enabled === false) return false;
  return !kind || discord.publish?.[kind] !== false;
}

// What the players learn of it: whether their rolls, and the fights, go to
// Discord. Never where
export type PostingSummary = { rolls?: true, combat?: true };

/** The players' summary of what the party posts; undefined when it posts nothing they'd see */
export function postingSummary(discord: PartyDiscord | undefined | null): PostingSummary | undefined {
  const rolls = publishes(discord, 'rolls');
  const combat = (['initiative', 'turns', 'combat'] as const).some(kind => publishes(discord, kind));
  if (!rolls && !combat) return undefined;
  return { ...rolls && { rolls: true }, ...combat && { combat: true } };
}

/** The message key of the players' notice: discord.posting.{rolls,combat,rollsAndCombat} */
export function postingKey(summary: PostingSummary | undefined | null): string | undefined {
  if (summary?.rolls && summary.combat) return 'discord.posting.rollsAndCombat';
  if (summary?.rolls) return 'discord.posting.rolls';
  if (summary?.combat) return 'discord.posting.combat';
  return undefined;
}
