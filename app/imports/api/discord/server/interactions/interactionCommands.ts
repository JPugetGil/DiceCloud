import CreatureLogs, { logRoll } from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { runAction } from '/imports/api/engine/action/methods/runAction';
import type { DiscordLanguage } from '/imports/api/creature/log/discord/discordMessages';
import { escapeMarkdown } from '/imports/api/creature/log/discord/partyMessages';
import { withInteractionOrigin, type InteractionOrigin, type LoggedEntry } from '/imports/api/discord/server/interactions/interactionOrigin';
import { editOriginal, type InteractionTarget } from '/imports/api/discord/server/interactions/interactionApi';
import {
  activeCharacterId, candidates, characterChoices, commandCharacter, isGameMasters, linkedUser, mayUse,
  namedCharacter, partyOfChannel, setActiveCharacter, type CommandCreature, type LinkedUser,
} from '/imports/api/discord/server/interactions/interactionCharacters';
import {
  EPHEMERAL, RESPONSE, interactionLanguage, logMessage, notLinkedMessage, say, textMessage, type ReplyButton,
} from '/imports/api/discord/server/interactions/interactionReplies';
import { rerollButtons, singleD20 } from '/imports/api/discord/server/interactions/interactionRerolls';

/*
 * The slash commands (D6): /roll, /check, /save, /hp and /character, in a
 * server, the application's DMs or a private channel. Only for a Discord
 * user who linked a DiceCloud account, with the characters that account may
 * edit (interactionCharacters.ts). What runs the engine is answered at once
 * with a deferred reply (Discord waits 3 seconds at most), then the reply is
 * edited: the same paths as the application's (the log's "Roll dice", a
 * check button, the hit points' menu), written to the character's log, and
 * posted by the D2 and D3 webhooks everywhere but into the reply's own
 * channel (interactionOrigin.ts).
 *
 * Public unless `secret`; a game master's monster or non-player character is
 * never shown publicly, as on the party board, its hit points least of all.
 */

export type Interaction = {
  id?: string,
  application_id: string,
  type: number,
  token: string,
  data?: {
    name?: string,
    custom_id?: string,
    options?: { name: string, type: number, value?: unknown, focused?: boolean }[],
  },
  guild_id?: string,
  channel_id?: string,
  channel?: { id?: string, parent_id?: string, type?: number },
  member?: { user?: { id?: string }, permissions?: string },
  // What the bot may do where the interaction comes from (phase D)
  app_permissions?: string,
  user?: { id?: string },
  locale?: string,
  message?: { id?: string, flags?: number, webhook_id?: string },
};

/** The answer to send at once, and what to do once it has left */
export type Handled = { response: Record<string, unknown>, after?: () => Promise<void> };

/** A method run by the server for a user, as a command does */
export const invocationOf = (userId: string) => ({
  userId, isSimulation: false, connection: null, unblock() {}, setUserId() {},
}) as any;

/** Who runs an interaction, where, in which language */
export async function interactionContext(interaction: Interaction) {
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;
  const user = await linkedUser(discordUserId);
  const channelId = interaction.channel_id ?? interaction.channel?.id;
  const party = user ? await partyOfChannel([channelId, interaction.channel?.parent_id], user._id) : undefined;
  return {
    discordUserId: discordUserId as string,
    user,
    language: interactionLanguage(interaction.locale),
    guildId: interaction.guild_id,
    channelId,
    party,
    target: { applicationId: interaction.application_id, token: interaction.token } as InteractionTarget,
  };
}

type Context = Awaited<ReturnType<typeof interactionContext>>;

const optionOf = (interaction: Interaction, name: string) => interaction.data?.options?.find(option => option.name === name)?.value;
const stringOption = (interaction: Interaction, name: string) => {
  const value = optionOf(interaction, name);
  return typeof value === 'string' ? value : undefined;
};
const numberOption = (interaction: Interaction, name: string) => {
  const value = optionOf(interaction, name);
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined;
};

const reply = (message: Record<string, unknown>): Handled => ({ response: { type: RESPONSE.message, data: message } });

/** An error, as its user reads it */
function failure(language: DiscordLanguage, error: unknown) {
  const reason = (error as { reason?: string, message?: string })?.reason || (error as Error)?.message || String(error);
  return textMessage(say(language, 'failed', { error: reason.slice(0, 300) }));
}

/** Answers at once that the reply is coming (for its user alone, or not), then edits it with what `work` returns */
function deferred(context: Context, ephemeral: boolean, work: () => Promise<Record<string, unknown>>): Handled {
  return {
    response: { type: RESPONSE.deferredMessage, ...ephemeral && { data: { flags: EPHEMERAL } } },
    after: async () => {
      let message: Record<string, unknown>;
      try {
        message = await work();
      } catch (e) {
        console.warn(`Discord: a command failed: ${(e as Error)?.message || e}`);
        message = failure(context.language, e);
      }
      // An edit keeps what the deferral said: for its user alone, or not
      const { flags, ...rest } = message as { flags?: number };
      const kept = (flags ?? 0) & ~EPHEMERAL;
      await editOriginal(context.target, { ...rest, ...kept && { flags: kept } });
    },
  };
}

// ---------------------------------------------------------------- the character

type Chosen = { creature: CommandCreature } | { refusal: Handled };

async function chooseCharacter(context: Context & { user: LinkedUser }, option?: string): Promise<Chosen> {
  const resolved = await commandCharacter({
    user: context.user, discordUserId: context.discordUserId, guildId: context.guildId, party: context.party, option,
  });
  if ('creature' in resolved) {
    // Read again, for its rights
    if (!mayUse(resolved.creature, context.user)) return { refusal: reply(textMessage(say(context.language, 'denied'))) };
    return { creature: resolved.creature };
  }
  const key = resolved.problem === 'none' ? 'noCharacter' : resolved.problem === 'ambiguous' ? 'characterAmbiguous' : 'characterNotFound';
  return { refusal: reply(textMessage(say(context.language, key, { name: escapeMarkdown(resolved.name || '') }))) };
}

// ---------------------------------------------------------------- rolls and checks

/** A roll typed, as the log's "Roll dice" makes it; returns its entry */
export async function runRoll(user: LinkedUser, creature: CommandCreature, formula: string, advantage: number, origin: InteractionOrigin) {
  const logId = await withInteractionOrigin(origin, () => (logRoll as any)._execute(invocationOf(user._id), {
    roll: formula, creatureId: creature._id, ...advantage && { advantage },
  }));
  return origin.logs.find(log => log.creatureId === creature._id)
    ?? await CreatureLogs.findOneAsync(logId as string) as LoggedEntry | undefined;
}

type CheckProp = {
  _id: string, name?: string, variableName?: string, type: string, skillType?: string, ability?: string,
  advantage?: number, value?: number, modifier?: number,
};

/** The checks (skills and abilities) or the saving throws a character rolls */
export async function checkProps(creatureId: string, kind: 'check' | 'save'): Promise<CheckProp[]> {
  return await CreatureProperties.find({
    'root.id': creatureId,
    removed: { $ne: true },
    inactive: { $ne: true },
    overridden: { $ne: true },
    variableName: { $exists: true },
    $or: kind === 'save'
      ? [{ type: 'skill', skillType: 'save' }]
      : [{ type: 'skill', skillType: { $in: ['skill', 'check', 'tool'] } }, { type: 'attribute', attributeType: 'ability' }],
  } as any, {
    fields: { name: 1, variableName: 1, type: 1, skillType: 1, ability: 1, advantage: 1, value: 1, modifier: 1 },
    sort: { left: 1 },
  }).fetchAsync() as CheckProp[];
}

/** The check an option names: by the variable the autocomplete gave, else by its name */
async function findCheck(creatureId: string, kind: 'check' | 'save', value: string): Promise<CheckProp | undefined> {
  const props = await checkProps(creatureId, kind);
  const typed = value.trim().toLowerCase();
  return props.find(prop => prop.variableName === value)
    ?? props.find(prop => (prop.name || '').trim().toLowerCase() === typed)
    ?? props.find(prop => (prop.variableName || '').toLowerCase() === typed);
}

/** The variables of a check or a saving throw, as the sheet's buttons give them (CheckButton.vue) */
export function checkVariables(prop: CheckProp) {
  return prop.type === 'attribute'
    ? { abilityVariableName: prop.variableName }
    : { skillVariableName: prop.variableName, abilityVariableName: prop.ability };
}

/** A check or a saving throw, as the sheet's buttons make it, with its options decided; returns its entry */
export async function runCheck(user: LinkedUser, creature: CommandCreature, variables: {
  skillVariableName?: string, abilityVariableName?: string,
}, advantage: number, origin: InteractionOrigin) {
  const params = { advantage: advantage as -1 | 0 | 1, ...variables, dc: null };
  const invocation = invocationOf(user._id);
  await withInteractionOrigin(origin, async () => {
    const actionId = await (insertAction as any)._execute(invocation, {
      action: {
        creatureId: creature._id,
        task: { subtaskFn: 'check', targetIds: [creature._id], ...params },
        results: [], taskCount: 0, _decisions: [],
      },
    });
    await (runAction as any)._execute(invocation, { actionId, decisions: [params] });
  });
  return origin.logs.find(log => log.creatureId === creature._id);
}

/** A roll's or a check's entry as the reply, with its reroll buttons when advantage applies */
export async function entryReply({ entry, creature, language, reroll }: {
  entry: LoggedEntry | undefined,
  creature: CommandCreature,
  language: DiscordLanguage,
  reroll?: Parameters<typeof rerollButtons>[0],
}): Promise<Record<string, unknown>> {
  if (!entry) return textMessage(say(language, 'nothingLogged'));
  const buttons: ReplyButton[] = reroll ? await rerollButtons(reroll, language) : [];
  return logMessage({ log: entry, creature, language, buttons });
}

async function rollCommand(interaction: Interaction, context: Context & { user: LinkedUser }): Promise<Handled> {
  const formula = stringOption(interaction, 'formula')?.trim();
  if (!formula) return reply(textMessage(say(context.language, 'noFormula')));
  const chosen = await chooseCharacter(context, stringOption(interaction, 'character'));
  if ('refusal' in chosen) return chosen.refusal;
  const { creature } = chosen;
  const secret = optionOf(interaction, 'secret') === true || isGameMasters(creature);
  return deferred(context, secret, async () => {
    const entry = await runRoll(context.user, creature, formula, 0, { channelId: context.channelId, logs: [] });
    return entryReply({
      entry, creature, language: context.language,
      ...singleD20(formula) && { reroll: { creatureId: creature._id, kind: 'roll', roll: formula, secret } },
    });
  });
}

async function checkCommand(interaction: Interaction, context: Context & { user: LinkedUser }, kind: 'check' | 'save'): Promise<Handled> {
  const typed = stringOption(interaction, kind === 'save' ? 'ability' : 'skill')?.trim();
  const chosen = await chooseCharacter(context, stringOption(interaction, 'character'));
  if ('refusal' in chosen) return chosen.refusal;
  const { creature } = chosen;
  const prop = typed ? await findCheck(creature._id, kind, typed) : undefined;
  if (!prop) {
    return reply(textMessage(say(context.language, kind === 'save' ? 'saveNotFound' : 'checkNotFound', {
      name: escapeMarkdown(creature.name || ''), check: escapeMarkdown(typed || ''),
    })));
  }
  const option = numberOption(interaction, 'advantage');
  const advantage = option !== undefined && [-1, 0, 1].includes(option) ? option : (prop.advantage || 0);
  const secret = optionOf(interaction, 'secret') === true || isGameMasters(creature);
  const variables = checkVariables(prop);
  return deferred(context, secret, async () => {
    const entry = await runCheck(context.user, creature, variables, advantage, { channelId: context.channelId, logs: [] });
    return entryReply({
      entry, creature, language: context.language, reroll: { creatureId: creature._id, kind: 'check', ...variables, secret },
    });
  });
}

// ---------------------------------------------------------------- hit points

type Bar = { _id: string, name?: string, variableName?: string, value?: number, total?: number };
const TEMP_HIT_POINTS = /^temp(HP|HitPoints)$/i;

/** The hit points (the `hitPoints` health bar, else the first) and the temporary ones, as the sheet finds them */
export async function hitPointsOf(creatureId: string): Promise<{ hitPoints?: Bar, temporary?: Bar }> {
  const bars = await CreatureProperties.find({
    'root.id': creatureId, type: 'attribute', attributeType: 'healthBar',
    removed: { $ne: true }, inactive: { $ne: true }, overridden: { $ne: true },
  } as any, { fields: { name: 1, variableName: 1, value: 1, total: 1 }, sort: { left: 1 } }).fetchAsync() as Bar[];
  return {
    hitPoints: bars.find(bar => bar.variableName === 'hitPoints') || bars.find(bar => !TEMP_HIT_POINTS.test(bar.variableName || '')),
    temporary: bars.find(bar => TEMP_HIT_POINTS.test(bar.variableName || '')),
  };
}

function hitPointsText(language: DiscordLanguage, name: string, { hitPoints, temporary }: { hitPoints?: Bar, temporary?: Bar }) {
  if (!hitPoints) return say(language, 'hpNone', { name });
  const line = say(language, 'hpLine', { name, value: hitPoints.value ?? 0, total: hitPoints.total ?? 0 });
  return temporary?.value ? `${line} ${say(language, 'hpTemporary', { temporary: temporary.value })}` : line;
}

async function runTask(userId: string, creatureId: string, task: Record<string, unknown>, origin: InteractionOrigin) {
  const invocation = invocationOf(userId);
  await withInteractionOrigin(origin, async () => {
    const actionId = await (insertAction as any)._execute(invocation, {
      action: { creatureId, task: { targetIds: [creatureId], ...task }, results: [], taskCount: 0, _decisions: [] },
    });
    await (runAction as any)._execute(invocation, { actionId, decisions: [] });
  });
}

async function hpCommand(interaction: Interaction, context: Context & { user: LinkedUser }): Promise<Handled> {
  const chosen = await chooseCharacter(context, stringOption(interaction, 'character'));
  if ('refusal' in chosen) return chosen.refusal;
  const { creature } = chosen;
  const name = escapeMarkdown(creature.name || '?');
  const damage = numberOption(interaction, 'damage');
  const healing = numberOption(interaction, 'healing');
  const temporary = numberOption(interaction, 'temporary');
  const bars = await hitPointsOf(creature._id);
  // Seen: for its user alone
  if (damage === undefined && healing === undefined && temporary === undefined) {
    return reply(textMessage(hitPointsText(context.language, name, bars)));
  }
  if (!bars.hitPoints) return reply(textMessage(say(context.language, 'hpNone', { name })));
  if (temporary !== undefined && !bars.temporary) return reply(textMessage(say(context.language, 'hpNoTemporary', { name })));
  // Changed: announced in the channel, unless it is the game master's creature
  const ephemeral = isGameMasters(creature);
  return deferred(context, ephemeral, async () => {
    const origin = { channelId: context.channelId, logs: [] };
    const done: string[] = [];
    // Temporary hit points first, as damage takes them first
    if (temporary !== undefined && bars.temporary) {
      await runTask(context.user._id, creature._id, {
        subtaskFn: 'damageProp',
        params: { title: bars.temporary.name, operation: 'set', value: temporary, targetProp: { _id: bars.temporary._id } },
      }, origin);
      done.push(say(context.language, 'hpTemporarySet', { amount: temporary }));
    }
    if (damage !== undefined) {
      await runTask(context.user._id, creature._id, { subtaskFn: 'dealDamage', params: { amount: damage } }, origin);
      done.push(say(context.language, 'hpDamaged', { amount: damage }));
    }
    if (healing !== undefined) {
      await runTask(context.user._id, creature._id, { subtaskFn: 'dealDamage', params: { amount: healing, damageType: 'healing' } }, origin);
      done.push(say(context.language, 'hpHealed', { amount: healing }));
    }
    const after = await hitPointsOf(creature._id);
    return textMessage(`${done.map(line => `${name} ${line}`).join('\n')}\n${hitPointsText(context.language, name, after)}`, { ephemeral });
  });
}

// ---------------------------------------------------------------- the character chosen

async function characterCommand(interaction: Interaction, context: Context & { user: LinkedUser }): Promise<Handled> {
  const option = stringOption(interaction, 'name')?.trim();
  const list = await candidates(context.user, context.party);
  const here = context.guildId ? 'server' : 'dm';
  if (!option) {
    const activeId = await activeCharacterId(context.discordUserId, context.guildId, context.user._id);
    const active = list.find(creature => creature._id === activeId);
    return reply(textMessage(active
      ? say(context.language, `activeShow.${here}`, { name: escapeMarkdown(active.name || '?') })
      : say(context.language, 'activeNone')));
  }
  const resolved = namedCharacter(list, option);
  if (!('creature' in resolved)) {
    const key = resolved.problem === 'ambiguous' ? 'characterAmbiguous' : 'characterNotFound';
    return reply(textMessage(say(context.language, key, { name: escapeMarkdown(resolved.name || '') })));
  }
  await setActiveCharacter(context.discordUserId, context.guildId, context.user._id, resolved.creature._id);
  return reply(textMessage(say(context.language, `activeSet.${here}`, { name: escapeMarkdown(resolved.creature.name || '?') })));
}

// ---------------------------------------------------------------- dispatch

/** A slash command */
export async function handleCommand(interaction: Interaction): Promise<Handled> {
  const context = await interactionContext(interaction);
  if (!context.user) return reply(notLinkedMessage(context.language));
  const linked = context as Context & { user: LinkedUser };
  switch (interaction.data?.name) {
    case 'roll': return rollCommand(interaction, linked);
    case 'check': return checkCommand(interaction, linked, 'check');
    case 'save': return checkCommand(interaction, linked, 'save');
    case 'hp': return hpCommand(interaction, linked);
    case 'character': return characterCommand(interaction, linked);
    case 'connect': {
      const { connectCommand } = await import('/imports/api/discord/server/interactions/interactionConnect');
      return connectCommand(interaction, linked);
    }
    default: return reply(textMessage(say(context.language, 'unknownCommand')));
  }
}

const choices = (list: { name: string, value: string }[]) => ({ response: { type: RESPONSE.autocomplete, data: { choices: list.slice(0, 25) } } });

/** What an option being typed may be: characters, checks, saving throws */
export async function handleAutocomplete(interaction: Interaction): Promise<Handled> {
  const context = await interactionContext(interaction);
  const focused = interaction.data?.options?.find(option => option.focused);
  if (!context.user || !focused) return choices([]);
  const typed = typeof focused.value === 'string' ? focused.value : '';
  const user = context.user;
  if (focused.name === 'target') {
    const { connectTargets } = await import('/imports/api/discord/server/interactions/interactionConnect');
    const query = typed.trim().toLowerCase();
    return choices((await connectTargets(user))
      .filter(target => !query || target.name.toLowerCase().includes(query))
      .map(target => ({
        name: say(context.language, target.value.startsWith('folder:') ? 'connectChoiceParty' : 'connectChoiceCharacter', { name: target.name }).slice(0, 100),
        value: target.value,
      })));
  }
  if (focused.name === 'character' || focused.name === 'name') {
    return choices(await characterChoices(await candidates(user, context.party), typed));
  }
  if (focused.name === 'skill' || focused.name === 'ability') {
    const resolved = await commandCharacter({
      user, discordUserId: context.discordUserId, guildId: context.guildId, party: context.party,
      option: stringOption(interaction, 'character'),
    });
    if (!('creature' in resolved)) return choices([]);
    const props = await checkProps(resolved.creature._id, focused.name === 'ability' ? 'save' : 'check');
    const query = typed.trim().toLowerCase();
    return choices(props
      .filter(prop => !query || (prop.name || '').toLowerCase().includes(query) || (prop.variableName || '').toLowerCase().includes(query))
      .map(prop => {
        const bonus = prop.type === 'attribute' ? prop.modifier : prop.value;
        const signed = Number.isFinite(bonus) ? ` (${(bonus as number) >= 0 ? '+' : ''}${bonus})` : '';
        return { name: `${prop.name || prop.variableName}${signed}`.slice(0, 100), value: prop.variableName as string };
      }));
  }
  return choices([]);
}
