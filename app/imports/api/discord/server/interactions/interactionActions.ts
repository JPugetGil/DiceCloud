import { Meteor } from 'meteor/meteor';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import EngineActions from '/imports/api/engine/action/EngineActions';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { runAction } from '/imports/api/engine/action/methods/runAction';
import removeActions from '/imports/api/engine/action/functions/removeActions';
import assertMayTarget from '/imports/api/engine/action/functions/assertMayTarget';
import { hiddenTargets } from '/imports/api/engine/action/functions/hiddenStats';
import computeCreature from '/imports/api/engine/computeCreature';
import { getCreature, getSingleProperty, reloadCachedProperties } from '/imports/api/engine/loadCreatures';
import selectAmmoItem from '/imports/api/creature/creatureProperties/methods/selectAmmoItem';
import {
  NO_SLOT, RITUAL, SPELL_SLOT_FILTER, SPELL_SLOT_SORT, canCastSpellWithSlot, castingParams, defaultCasting,
} from '/imports/api/creature/creatureProperties/castingSlots';
import { targetPickingOf } from '/imports/api/creature/creatureFolders/targetCandidates';
import { translatorFor, visibleLines, type DiscordLanguage } from '/imports/api/creature/log/discord/discordMessages';
import { escapeMarkdown } from '/imports/api/creature/log/discord/partyMessages';
import { withInteractionOrigin, type LoggedEntry } from '/imports/api/discord/server/interactions/interactionOrigin';
import { editOriginal, followUp, type InteractionTarget } from '/imports/api/discord/server/interactions/interactionApi';
import {
  commandCharacter, commandCreature, mayUse, isGameMasters, type CommandCreature, type LinkedUser,
} from '/imports/api/discord/server/interactions/interactionCharacters';
import {
  BUTTON_STYLE, EPHEMERAL, RESPONSE, logMessage, notLinkedMessage, say, textMessage,
} from '/imports/api/discord/server/interactions/interactionReplies';
import {
  handleAutocomplete, interactionContext, invocationOf, type Handled, type Interaction,
} from '/imports/api/discord/server/interactions/interactionCommands';
import {
  DiscordActionSessions, answerSession, endSession, lastTargets, noteSession, readSession, rememberTargets, startSession,
  type ActionSession, type PendingInput,
} from '/imports/api/discord/server/interactions/actionSessions';
import { dryRun, revealDice, type ReplayQuestion } from '/imports/api/discord/server/interactions/actionReplay';
import {
  candidatesIn, namedTarget, partiesOfCreature, type Candidate,
} from '/imports/api/discord/server/interactions/actionTargets';
import {
  closedMessage, menuMessage, selectRows, type MenuButton, type MenuOption,
} from '/imports/api/discord/server/interactions/actionMenus';

/*
 * /action (D6, decisions of 16 October): any of the character's actions and
 * spells, run from Discord through menus its user alone sees, then posted in
 * the channel as /roll is (for its user alone with `secret`, and always for
 * a game master's monster or non-player character).
 *
 * The menus ask what the sheet asks, in its order:
 * - the targets: during a fight, the menu opens by itself, "No target"
 *   always there and the action's last targets preselected; outside one, the
 *   `target` option, none without it (actionTargets.ts, the sheet's rules);
 * - the spell slot, as the cast dialog offers them (castingSlots.ts);
 * - the ammunition, when the action consumes items of a tag and more than
 *   one item has it, or none is chosen: chosen as on the sheet
 *   (selectAmmoItem), which keeps it;
 * - then each choice the action itself asks; never a roll's advantage
 *   (decision of 17 October): the `advantage` option's, else the sheet's
 *   suggestion (its conditions and effects). The action is inserted as the
 *   browser inserts it
 *   (insertAction), played again on the server with the answers so far to
 *   find the next choice (actionReplay.ts: it writes nothing), and once none
 *   is left, run with them (runAction). Everything as the Discord user's
 *   DiceCloud account, with every check a browser gets: edit permission,
 *   assertMayTarget at insertion and at run, taskFromDatabase, the results
 *   emptied.
 *
 * Between two menus the server keeps the session (actionSessions.ts), which
 * the custom_id names with its step. At each click everything is read again:
 * the same Discord user, the account still linked, the right to edit the
 * character, the action still on the sheet, the targets still allowed, the
 * engine's action still there (another action of the character, from the
 * sheet or Discord, replaces it). The menus and the result follow what the
 * players may read: names alone, and the character's log entry as its
 * players read it, never a monster's numbers.
 */

const CUSTOM_ID = /^dc:act:(\w{17}):(\d{1,5}):([a-z]{1,8})(?::(-?[\w]{1,8}))?$/;

// How long the reply waits for a menu to be ready before deferring: Discord
// waits 3 seconds for an answer
const ANSWER_BUDGET_MS = 2000;
let answerBudgetMs = ANSWER_BUDGET_MS;

/** How long a reply waits for its menu before deferring, for a test of the slow way; refused outside tests */
export function setActionAnswerBudget(ms = ANSWER_BUDGET_MS) {
  if (!Meteor.isTest && !Meteor.isAppTest) throw new Meteor.Error('test-only', 'Only tests change the answer budget');
  answerBudgetMs = ms;
}

type Language = DiscordLanguage;
const t = (language: Language, key: string, params: Record<string, string | number> = {}) => say(language, `action.${key}`, params);
const app = (language: Language, key: string, params: Record<string, string | number> = {}) => translatorFor(language)(key, params) ?? key;

// ---------------------------------------------------------------- the actions of a character

type ItemConsumed = { _id?: string, tag?: string, itemId?: string, itemName?: string, available?: number, quantity?: { value?: number } };
type AttributeConsumed = { variableName?: string, statName?: string, quantity?: { value?: number } };

/** An action or a spell, as /action reads it */
export type ActionProp = {
  _id: string,
  type: 'action' | 'spell',
  name?: string,
  actionType?: string,
  target?: string,
  level?: number,
  ritual?: boolean,
  castWithoutSpellSlots?: boolean,
  prepared?: boolean,
  alwaysPrepared?: boolean,
  uses?: { value?: number },
  usesLeft?: number,
  insufficientResources?: boolean,
  inactive?: boolean,
  removed?: boolean,
  resources?: { itemsConsumed?: ItemConsumed[], attributesConsumed?: AttributeConsumed[] },
  root?: { id: string },
};

const ACTION_FIELDS = {
  name: 1, type: 1, actionType: 1, target: 1, level: 1, ritual: 1, castWithoutSpellSlots: 1, prepared: 1, alwaysPrepared: 1,
  uses: 1, usesLeft: 1, insufficientResources: 1, resources: 1, root: 1,
};

// The sheet's actions (every kind, its events too), and the spells the cast dialog offers
const ACTIONS_FILTER = {
  removed: { $ne: true },
  inactive: { $ne: true },
  $or: [{ type: 'action' }, { type: 'spell', $or: [{ prepared: true }, { alwaysPrepared: true }] }],
};

/** The character's actions and spells, in the sheet's order */
export async function actionsOf(creatureId: string): Promise<ActionProp[]> {
  return await CreatureProperties.find({ 'root.id': creatureId, ...ACTIONS_FILTER } as any, {
    fields: ACTION_FIELDS, sort: { left: 1 },
  }).fetchAsync() as ActionProp[];
}

const offered = (prop: ActionProp | undefined) => !!prop && !prop.removed && !prop.inactive
  && (prop.type === 'action' || (prop.type === 'spell' && (!!prop.prepared || !!prop.alwaysPrepared)));

/** The action a session runs, as the sheet has it now; undefined once it no longer offers it */
async function actionOf(creatureId: string, propId: string): Promise<ActionProp | undefined> {
  const prop = await getSingleProperty(creatureId, propId) as ActionProp | undefined;
  return offered(prop) ? prop : undefined;
}

/** The action an option names: by the id the autocomplete gave, else by its name */
async function namedAction(creatureId: string, value: string): Promise<{ prop: ActionProp } | { problem: 'notFound' | 'ambiguous' }> {
  const props = await actionsOf(creatureId);
  const byId = props.find(prop => prop._id === value);
  if (byId) return { prop: byId };
  const typed = value.trim().toLowerCase();
  const named = props.filter(prop => (prop.name || '').trim().toLowerCase() === typed);
  if (named.length === 1) return { prop: named[0] };
  return { problem: named.length ? 'ambiguous' : 'notFound' };
}

const title = (prop: { name?: string }) => prop.name?.trim() || '?';

/** "Fireball — level 3 spell · 2/3 uses": what the autocomplete shows of an action */
function actionChoiceName(prop: ActionProp, language: Language): string {
  const kind = prop.type === 'spell'
    ? (prop.level ? t(language, 'spellLevel', { level: prop.level }) : t(language, 'cantrip'))
    : app(language, `actionTypes.${prop.actionType || 'action'}`);
  const costs: string[] = [];
  if (Number.isFinite(prop.uses?.value) && prop.usesLeft !== undefined) {
    costs.push(t(language, 'uses', { left: Math.max(prop.usesLeft, 0), total: prop.uses?.value as number }));
  }
  for (const attribute of prop.resources?.attributesConsumed || []) {
    const quantity = attribute.quantity?.value;
    if (attribute.variableName && quantity) costs.push(`${quantity} ${attribute.statName || attribute.variableName}`);
  }
  for (const item of prop.resources?.itemsConsumed || []) {
    const quantity = item.quantity?.value;
    if (quantity && (item.itemName || item.tag)) costs.push(`${quantity} ${item.itemName || item.tag}`);
  }
  if (shortage(prop)) costs.push(t(language, 'short'));
  return `${title(prop)} — ${[kind, ...costs].join(' · ')}`.slice(0, 100);
}

/** What the engine would refuse the action for, as the sheet's disabled button: no uses left, not enough resources */
function shortage(prop: ActionProp): 'uses' | 'resources' | undefined {
  if (prop.usesLeft !== undefined && prop.usesLeft <= 0) return 'uses';
  if (prop.insufficientResources) return 'resources';
  return undefined;
}

// ---------------------------------------------------------------- spell slots and ammunition

type SlotProp = { _id: string, name?: string, value?: number, total?: number, spellSlotLevel?: { value?: number } };

/** How the spell may be cast: the slots it may be cast with, its ritual casting; nothing to choose for a cantrip */
async function castingsOf(creatureId: string, spell: ActionProp): Promise<{ options: MenuOption[], first?: string } | 'none'> {
  if (spell.level === 0 || spell.castWithoutSpellSlots) return 'none';
  const slots = await CreatureProperties.find({ 'root.id': creatureId, ...SPELL_SLOT_FILTER } as any, {
    fields: { name: 1, value: 1, total: 1, spellSlotLevel: 1 }, sort: SPELL_SLOT_SORT as any,
  }).fetchAsync() as SlotProp[];
  const castable = slots.filter(slot => canCastSpellWithSlot(spell, slot._id, slot));
  const options: MenuOption[] = castable.map(slot => ({ value: slot._id, label: slot.name?.trim() || '?', description: '' }));
  if (spell.ritual) options.push({ value: RITUAL, label: '' });
  return { options, first: defaultCasting(spell, slots) };
}

/** The labels of the castings, in a language */
function castingLabels(options: MenuOption[], slots: SlotProp[], language: Language): MenuOption[] {
  return options.map(option => {
    if (option.value === RITUAL) return { ...option, label: t(language, 'ritual') };
    const slot = slots.find(candidate => candidate._id === option.value);
    return {
      ...option,
      description: t(language, 'slotLeft', { level: slot?.spellSlotLevel?.value ?? '?', left: slot?.value ?? 0, total: slot?.total ?? slot?.value ?? 0 }),
    };
  });
}

type AmmoItem = { _id: string, name?: string, quantity?: number };

/** The items of a tag the creature may consume, as the sheet lists them (SelectItemToConsume.vue) */
async function itemsTagged(creatureId: string, tag: string): Promise<AmmoItem[]> {
  return await CreatureProperties.find({
    'root.id': creatureId, type: 'item', tags: tag, removed: { $ne: true }, inactive: { $ne: true },
  } as any, { fields: { name: 1, quantity: 1 }, sort: { left: 1 } }).fetchAsync() as AmmoItem[];
}

type AmmoNeed = { index: number, consumed: ItemConsumed, items: AmmoItem[], current?: AmmoItem };

/**
 * The first ammunition left to choose: items consumed of a tag that more
 * than one item has, or that none of the action's is chosen for. `none`: a
 * tag no item has, and none chosen
 */
async function ammoNeed(creatureId: string, prop: ActionProp, chosen: number[] = []): Promise<AmmoNeed | { none: ItemConsumed } | undefined> {
  const consumed = prop.resources?.itemsConsumed || [];
  for (let index = 0; index < consumed.length; index += 1) {
    const entry = consumed[index];
    if (chosen.includes(index) || !entry?.tag) continue;
    const items = await itemsTagged(creatureId, entry.tag);
    const current = items.find(item => item._id === entry.itemId);
    if (!items.length && !entry.itemId) return { none: entry };
    if (items.length > 1 || (items.length === 1 && !current)) return { index, consumed: entry, items, current };
  }
  return undefined;
}

// ---------------------------------------------------------------- screens

/** What comes next: a menu, the action run, or a refusal that ends the session */
type Screen = { menu: Record<string, unknown> } | { run: true } | { refusal: string };

type Step = { session: ActionSession, creature: CommandCreature, user: LinkedUser, language: Language };

const customIdOf = (session: ActionSession, what: string, arg?: string | number) => `dc:act:${session._id}:${session.step}:${what}${arg !== undefined ? `:${arg}` : ''}`;
const cancelButton = (step: Step): MenuButton => ({ customId: customIdOf(step.session, 'cancel'), label: t(step.language, 'cancel') });
const heading = (step: Step, prop: ActionProp) => `**${escapeMarkdown(title(prop))}** · ${escapeMarkdown(step.creature.name?.trim() || '?')}`;

/** The menu of the targets: one, or several ticked then confirmed; "No target" always */
async function targetMenu(step: Step, prop: ActionProp): Promise<Screen> {
  const { session, language } = step;
  const parties = await partiesOfCreature(session.creatureId, { fighting: !!session.fighting });
  const candidates = await candidatesIn(session.creatureId, parties, step.user);
  const single = prop.target !== 'multipleTargets';
  const ticked = (session.pendingTargetIds || []).filter(id => candidates.some(candidate => candidate._id === id));
  const kindOf = (candidate: Candidate) => candidate._id === session.creatureId ? app(language, 'targetPicker.me')
    : t(language, candidate.kind === 'monster' ? 'kindMonster' : 'kindCharacter');
  const options: MenuOption[] = candidates.map(candidate => ({
    value: candidate._id, label: candidate.name?.trim() || app(language, 'targetPicker.unnamed'), description: kindOf(candidate),
    default: ticked.includes(candidate._id),
  }));
  const { rows, hidden } = selectRows(options, {
    customId: index => customIdOf(session, 'tsel', index),
    placeholder: t(language, single ? 'targetPlaceholder' : 'targetsPlaceholder'),
    min: single ? 1 : 0,
    max: single ? 1 : 25,
  });
  const names = ticked.map(id => candidates.find(candidate => candidate._id === id)?.name?.trim() || '?');
  const lines = [heading(step, prop), t(language, single ? 'chooseTarget' : 'chooseTargets')];
  if (!single && names.length) lines.push(t(language, 'ticked', { names: escapeMarkdown(names.join(', ')) }));
  if (hidden) lines.push(t(language, 'moreTargets', { count: hidden }));
  const buttons: MenuButton[] = [];
  if (single && ticked.length) {
    buttons.push({ customId: customIdOf(session, 'tok'), label: app(language, 'targetPicker.targetCreature', { name: names[0] }), style: BUTTON_STYLE.primary });
  }
  if (!single) {
    buttons.push({ customId: customIdOf(session, 'tok'), label: t(language, 'confirmTargets', { count: ticked.length }), style: BUTTON_STYLE.primary, disabled: !ticked.length });
    if (candidates.some(candidate => candidate.kind === 'monster')) buttons.push({ customId: customIdOf(session, 'tall', 'm'), label: app(language, 'targetPicker.allMonsters') });
    buttons.push({ customId: customIdOf(session, 'tall', 'c'), label: app(language, 'targetPicker.allCharacters') });
  }
  buttons.push({ customId: customIdOf(session, 'tnone'), label: app(language, 'targetPicker.noTarget') }, cancelButton(step));
  await noteSession(session, { pendingTargetIds: ticked });
  return { menu: menuMessage(lines.join('\n'), rows, buttons) };
}

async function slotMenu(step: Step, prop: ActionProp, options: MenuOption[], first: string | undefined): Promise<Screen> {
  const { session, language } = step;
  const slots = await CreatureProperties.find({ 'root.id': session.creatureId, ...SPELL_SLOT_FILTER } as any, {
    fields: { name: 1, value: 1, total: 1, spellSlotLevel: 1 },
  }).fetchAsync() as SlotProp[];
  const labelled = castingLabels(options, slots, language).map(option => ({ ...option, default: option.value === first }));
  const { rows } = selectRows(labelled, { customId: index => customIdOf(session, 'ssel', index), placeholder: t(language, 'slotPlaceholder') });
  const firstLabel = labelled.find(option => option.value === first)?.label;
  const buttons: MenuButton[] = [
    ...first && firstLabel ? [{ customId: customIdOf(session, 'sok'), label: t(language, 'castWith', { slot: firstLabel }), style: BUTTON_STYLE.primary }] : [],
    cancelButton(step),
  ];
  return { menu: menuMessage([heading(step, prop), t(language, 'chooseSlot')].join('\n'), rows, buttons) };
}

async function ammoMenu(step: Step, prop: ActionProp, need: AmmoNeed): Promise<Screen> {
  const { session, language } = step;
  const options: MenuOption[] = need.items.map(item => ({
    value: item._id, label: item.name?.trim() || '?', description: t(language, 'ammoLeft', { count: item.quantity ?? 0 }),
    default: item._id === need.current?._id,
  }));
  const { rows, hidden } = selectRows(options, { customId: index => customIdOf(session, 'asel', `${need.index}x${index}`), placeholder: t(language, 'ammoPlaceholder') });
  const buttons: MenuButton[] = [
    ...need.current ? [{
      customId: customIdOf(session, 'aok', need.index), label: t(language, 'useAmmo', { name: need.current.name?.trim() || '?' }), style: BUTTON_STYLE.primary,
    }] : [],
    cancelButton(step),
  ];
  const lines = [heading(step, prop), t(language, 'chooseAmmo', { tag: escapeMarkdown(need.consumed.tag || '') })];
  if (hidden) lines.push(t(language, 'moreOptions', { count: hidden }));
  return { menu: menuMessage(lines.join('\n'), rows, buttons) };
}

/** The menu of one of the action's choices (its rolls' advantage is never asked: dryRun) */
function questionMenu(step: Step, prop: ActionProp, question: ReplayQuestion, count: number, language: Language): Screen {
  const { session } = step;
  const nth = count > 1 ? ` (${count})` : '';
  const options: MenuOption[] = question.choices.map(choice => ({
    value: choice._id,
    label: choice.name?.trim() || (choice.type && translatorFor(language)(`propertyTypes.${choice.type}.name`, {})) || '?',
  }));
  const { rows, hidden } = selectRows(options, { customId: index => customIdOf(session, 'csel', index), placeholder: t(language, 'choicePlaceholder') });
  const lines = [heading(step, prop), `${t(language, 'choose')}${nth}`];
  if (hidden) lines.push(t(language, 'moreOptions', { count: hidden }));
  return { menu: menuMessage(lines.join('\n'), rows, [{ customId: customIdOf(session, 'cnone'), label: t(language, 'chooseNone') }, cancelButton(step)]) };
}

/** An error of the engine or of a method, in the reader's language when it says how (details.i18n) */
function errorText(language: Language, error: unknown): string {
  const i18n = (error as { details?: { i18n?: { key?: string, params?: Record<string, string | number> } } })?.details?.i18n;
  if (i18n?.key) {
    const text = translatorFor(language)(i18n.key, i18n.params || {});
    if (text) return text;
  }
  const reason = (error as { reason?: string, message?: string })?.reason || (error as Error)?.message || String(error);
  return say(language, 'failed', { error: reason.slice(0, 300) });
}

/** The task the engine applies: the action on its targets, or the spell cast as chosen */
function taskOf(session: ActionSession, prop: ActionProp) {
  const targetIds = prop.target === 'self' ? [] : session.targetIds || [];
  return prop.type === 'spell'
    ? { subtaskFn: 'castSpell', prop: { _id: prop._id }, targetIds, params: castingParams(session.casting) }
    : { prop: { _id: prop._id }, targetIds };
}

/**
 * What the session asks next, in its order: the targets, the spell slot, the
 * ammunition; then, once the action is inserted, the first question the
 * action asks that has no answer yet; else, the action is ready to run
 */
async function nextScreen(step: Step): Promise<Screen> {
  const { session, language, creature } = step;
  const prop = await actionOf(session.creatureId, session.propId);
  if (!prop) return { refusal: t(language, 'actionGone', { name: escapeMarkdown(creature.name || '?') }) };
  const action = escapeMarkdown(title(prop));
  const name = escapeMarkdown(creature.name || '?');
  if (session.targetIds === undefined) return targetMenu(step, prop);
  if (prop.type === 'spell' && session.casting === undefined) {
    const castings = await castingsOf(session.creatureId, prop);
    if (castings === 'none') {
      await noteSession(session, { casting: NO_SLOT });
    } else if (!castings.options.length) {
      return { refusal: t(language, 'noSlot', { name, action }) };
    } else if (castings.options.length === 1) {
      await noteSession(session, { casting: castings.options[0].value });
    } else {
      return slotMenu(step, prop, castings.options, castings.first);
    }
  }
  if (!session.actionId) {
    const need = await ammoNeed(session.creatureId, prop, session.ammoChosen);
    if (need && 'none' in need) return { refusal: t(language, 'noAmmo', { name, action, tag: escapeMarkdown(need.none.tag || '') }) };
    if (need) return ammoMenu(step, prop, need);
    const short = shortage(prop);
    if (short) return { refusal: t(language, short === 'uses' ? 'noUses' : 'noResources', { name, action }) };
    // The action, as the browser inserts it: the server reads the property
    // again (taskFromDatabase) and checks the targets (assertMayTarget)
    try {
      const actionId = await (insertAction as any)._execute(invocationOf(step.user._id), {
        action: { creatureId: session.creatureId, task: taskOf(session, prop), results: [], taskCount: 0, _decisions: [] },
      });
      await noteSession(session, { actionId });
    } catch (e) {
      return { refusal: errorText(language, e) };
    }
  }
  let replay;
  try {
    replay = await dryRun(session.actionId as string, session.decisions, { advantage: session.advantage });
  } catch (e) {
    return { refusal: errorText(language, e) };
  }
  // The advantages decided on the way (the option's, else the sheet's): kept,
  // so that the next dry run and runAction replay them
  if (replay.decided.length) await noteSession(session, { decisions: [...session.decisions, ...replay.decided] });
  if (!replay.question) return { run: true };
  await revealDice(session.actionId as string, replay.dice);
  const { question } = replay;
  const count = session.decisions.filter(decision => decision.kind === question.kind).length + 1;
  const pending: PendingInput = { kind: 'choose', ids: question.choices.map(choice => choice._id), count };
  await noteSession(session, { pending });
  return questionMenu(step, prop, question, count, language);
}

// ---------------------------------------------------------------- the result

/** Runs the action with the session's answers; returns the reply, a card or a refusal */
async function runSession(step: Step, channelId: string | undefined): Promise<{ card: Record<string, unknown> } | { refusal: string }> {
  const { session, language, creature } = step;
  const prop = await actionOf(session.creatureId, session.propId);
  const origin = { channelId, logs: [] as LoggedEntry[] };
  try {
    await withInteractionOrigin(origin, () => (runAction as any)._execute(invocationOf(step.user._id), {
      actionId: session.actionId, decisions: session.decisions,
    }));
  } catch (e) {
    // Refused at run (a target no longer allowed...): nothing will run it now
    await abandon(session);
    return { refusal: errorText(language, e) };
  }
  await endSession(session._id);
  // The targets chosen, from the menu or the option, which the next menu preselects
  const targetIds = session.targetIds || [];
  if (prop && prop.target !== 'self' && (session.fighting || targetIds.length)) {
    await rememberTargets(step.user._id, session.propId, targetIds);
  }
  const entry = origin.logs.find(log => log.creatureId === session.creatureId);
  if (!entry || !visibleLines(entry.content).length) {
    return { refusal: t(language, 'nothing', { action: escapeMarkdown(title(prop || {})) }) };
  }
  // As the players read it: the entry as written, its monsters' stats left out
  // again as a webhook leaves them (discordWebhooks.ts)
  const hiddenIds = await hiddenTargets(session.creatureId, session.targetIds || []);
  return { card: logMessage({ log: entry, creature, language, hiddenIds }) };
}

const withoutEphemeral = (message: Record<string, unknown>) => {
  const { flags, ...rest } = message as { flags?: number };
  const kept = (flags ?? 0) & ~EPHEMERAL;
  return { ...rest, ...kept && { flags: kept } };
};

/**
 * Runs the action and says so: as the edit of the command's own deferred
 * reply (`reply`: no menu shown, the reply is public unless secret), or, from
 * a menu, its message closed and the card posted as a new message, public
 * unless secret. A refusal goes where the menu was
 */
async function finish(step: Step, target: InteractionTarget, channelId: string | undefined, mode: 'reply' | 'menu') {
  const { session, language } = step;
  const result = await runSession(step, channelId);
  const prop = await actionOf(session.creatureId, session.propId);
  const action = escapeMarkdown(title(prop || {}));
  if ('refusal' in result) {
    if (mode === 'menu' || session.secret) {
      await editOriginal(target, withoutEphemeral(mode === 'menu' ? closedMessage(result.refusal) : textMessage(result.refusal)));
      return;
    }
    // The command's public reply says only that nothing was done; why, its user alone reads
    await editOriginal(target, withoutEphemeral(textMessage(t(language, 'notDone', { action }), { ephemeral: false })));
    await followUp(target, textMessage(result.refusal));
    return;
  }
  if (mode === 'reply') {
    await editOriginal(target, withoutEphemeral(result.card));
    return;
  }
  await editOriginal(target, withoutEphemeral(closedMessage(t(language, session.secret ? 'doneSecret' : 'donePublic', { action }))));
  const flags = ((result.card.flags as number | undefined) ?? 0) | (session.secret ? EPHEMERAL : 0);
  await followUp(target, { ...result.card, ...flags && { flags } });
}

/** A screen within Discord's 3 seconds, else undefined, still on its way */
async function within<T>(work: Promise<T>, ms = answerBudgetMs): Promise<T | undefined> {
  // No time at all (a test of the slow way): still on its way, whatever it is
  if (ms <= 0) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>(resolve => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  const done = await Promise.race([work, late]);
  clearTimeout(timer);
  return done;
}

/** Leaves a session: its engine's action goes (logged as abandoned if its dice were shown), the session too */
async function abandon(session: ActionSession) {
  await endSession(session._id);
  if (session.actionId) await removeActions({ _id: session.actionId, creatureId: session.creatureId }, true);
}

// ---------------------------------------------------------------- the command

const reply = (message: Record<string, unknown>): Handled => ({ response: { type: RESPONSE.message, data: message } });
const optionOf = (interaction: Interaction, name: string) => {
  const value = interaction.data?.options?.find(option => option.name === name)?.value;
  return typeof value === 'string' ? value : undefined;
};

/** /action: its checks, then its first menu, or the action run at once when it asks nothing */
export async function handleActionCommand(interaction: Interaction): Promise<Handled> {
  const context = await interactionContext(interaction);
  const { language } = context;
  if (!context.user) return reply(notLinkedMessage(language));
  const user = context.user;
  const resolved = await commandCharacter({
    user, discordUserId: context.discordUserId, guildId: context.guildId, party: context.party, option: optionOf(interaction, 'character'),
  });
  if (!('creature' in resolved)) {
    const key = resolved.problem === 'none' ? 'noCharacter' : resolved.problem === 'ambiguous' ? 'characterAmbiguous' : 'characterNotFound';
    return reply(textMessage(say(language, key, { name: escapeMarkdown(resolved.name || '') })));
  }
  const creature = resolved.creature;
  if (!mayUse(creature, user)) return reply(textMessage(say(language, 'denied')));
  const name = escapeMarkdown(creature.name || '?');
  const typed = optionOf(interaction, 'action')?.trim() || '';
  const found = typed ? await namedAction(creature._id, typed) : { problem: 'notFound' as const };
  if (!('prop' in found)) {
    return reply(textMessage(t(language, found.problem === 'ambiguous' ? 'actionAmbiguous' : 'actionNotFound', { name, action: escapeMarkdown(typed) })));
  }
  const prop = found.prop;
  const action = escapeMarkdown(title(prop));

  // The targets: the option's; during a fight, the menu; else none
  let targetIds: string[] | undefined = [];
  let fighting = false;
  let preselected: string[] = [];
  const typedTarget = optionOf(interaction, 'target')?.trim();
  if (prop.target !== 'self' && typedTarget) {
    const named = await namedTarget(creature._id, user, typedTarget);
    if ('problem' in named) {
      const text = named.problem === 'denied'
        ? t(language, 'targetDenied', { target: escapeMarkdown(named.name), action })
        : t(language, named.problem === 'ambiguous' ? 'targetAmbiguous' : 'targetNotFound', { target: escapeMarkdown(typedTarget) });
      return reply(textMessage(text));
    }
    targetIds = [named.target._id];
  } else if (prop.target !== 'self') {
    const parties = await partiesOfCreature(creature._id, { fighting: true });
    const candidates = parties.length ? await candidatesIn(creature._id, parties, user) : [];
    const picking = targetPickingOf(prop, 'auto', {
      fighting: parties.length > 0, othersToTarget: () => candidates.some(candidate => candidate._id !== creature._id),
    });
    if (picking) {
      targetIds = undefined;
      fighting = true;
      const last = (await lastTargets(user._id, prop._id) || []).filter(id => candidates.some(candidate => candidate._id === id));
      preselected = picking.single ? last.slice(0, 1) : last;
    }
  }
  // Refused at once when nothing the menus offer can mend it: no uses left,
  // no item of the ammunition's tag, not enough of a resource that is no
  // ammunition to choose
  const short = shortage(prop);
  if (short === 'uses') return reply(textMessage(t(language, 'noUses', { name, action })));
  const ammo = await ammoNeed(creature._id, prop);
  if (ammo && 'none' in ammo) return reply(textMessage(t(language, 'noAmmo', { name, action, tag: escapeMarkdown(ammo.none.tag || '') })));
  if (short && !ammo) return reply(textMessage(t(language, 'noResources', { name, action })));

  // A game master's monster or non-player character: for its game master alone, as its rolls
  const secret = interaction.data?.options?.find(option => option.name === 'secret')?.value === true || isGameMasters(creature);
  // Its rolls' advantage: the option's, as /check's, else as the sheet suggests
  const advantageOption = interaction.data?.options?.find(option => option.name === 'advantage')?.value;
  const advantage = advantageOption === 1 || advantageOption === 0 || advantageOption === -1 ? advantageOption : undefined;
  const session = await startSession({
    discordUserId: context.discordUserId, userId: user._id, creatureId: creature._id, propId: prop._id,
    secret, ...advantage !== undefined && { advantage }, ...context.channelId && { channelId: context.channelId },
    ...targetIds && { targetIds }, ...fighting && { fighting, pendingTargetIds: preselected },
  });
  const step: Step = { session, creature, user, language };
  const work = nextScreen(step);
  const screen = await within(work);
  if (screen && 'menu' in screen) return reply(screen.menu);
  if (screen && 'refusal' in screen) {
    await abandon(session);
    return reply(textMessage(screen.refusal));
  }
  if (screen && 'run' in screen) {
    // Nothing to ask: the reply is the result, public unless secret
    return {
      response: { type: RESPONSE.deferredMessage, ...secret && { data: { flags: EPHEMERAL } } },
      after: () => finish(step, context.target, context.channelId, 'reply'),
    };
  }
  // Slower than Discord waits: a reply for its user alone, its menu or the result to come
  return {
    response: { type: RESPONSE.deferredMessage, data: { flags: EPHEMERAL } },
    after: async () => {
      const late = await work.catch(e => ({ refusal: errorText(language, e) }));
      if ('menu' in late) await editOriginal(context.target, withoutEphemeral(late.menu));
      else if ('refusal' in late) {
        await abandon(session);
        await editOriginal(context.target, withoutEphemeral(textMessage(late.refusal)));
      } else await finish(step, context.target, context.channelId, secret ? 'reply' : 'menu');
    },
  };
}

// ---------------------------------------------------------------- the menus' clicks

const update = (message: Record<string, unknown>): Handled => ({ response: { type: RESPONSE.updateMessage, data: withoutEphemeral(message) } });

/** The answer a click gives the session's menu, checked against what the menu offered; undefined when it offered no such thing */
async function answerOf(step: Step, prop: ActionProp, what: string, arg: string | undefined, values: string[]): Promise<
  { changes: Partial<ActionSession>, unset?: (keyof ActionSession)[], notice?: string } | { refusal: string } | undefined
> {
  const { session, user, language } = step;
  const name = escapeMarkdown(step.creature.name || '?');
  const action = escapeMarkdown(title(prop));
  if (session.targetIds === undefined) {
    const parties = await partiesOfCreature(session.creatureId, { fighting: !!session.fighting });
    const candidates = await candidatesIn(session.creatureId, parties, user);
    const ids = candidates.map(candidate => candidate._id);
    const single = prop.target !== 'multipleTargets';
    if (what === 'tnone') return { changes: { targetIds: [] }, unset: ['pendingTargetIds'] };
    if (what === 'tok') {
      const ticked = (session.pendingTargetIds || []).filter(id => ids.includes(id));
      return ticked.length ? { changes: { targetIds: single ? ticked.slice(0, 1) : ticked }, unset: ['pendingTargetIds'] } : undefined;
    }
    if (what === 'tall' && !single && (arg === 'm' || arg === 'c')) {
      const kind = arg === 'm' ? 'monster' : 'character';
      const all = candidates.filter(candidate => candidate.kind === kind).map(candidate => candidate._id);
      return all.length ? { changes: { targetIds: all }, unset: ['pendingTargetIds'] } : undefined;
    }
    // A creature the menu offered that may no longer be targeted (the game
    // master turned that off meanwhile): said, and the menu offered again
    const refused = what === 'tsel' ? values.find(id => !ids.includes(id)) : undefined;
    if (refused) {
      const named = await namedTarget(session.creatureId, user, refused);
      if (!('problem' in named) || named.problem !== 'denied') return undefined;
      return { changes: {}, notice: t(language, 'targetDenied', { target: escapeMarkdown(named.name), action }) };
    }
    if (what === 'tsel') {
      if (single) return values.length === 1 ? { changes: { targetIds: values }, unset: ['pendingTargetIds'] } : undefined;
      // Several: this select's own creatures as ticked now, the others' as they were
      const chunk = new Set(ids.slice(Number(arg) * 25, Number(arg) * 25 + 25));
      const kept = (session.pendingTargetIds || []).filter(id => !chunk.has(id));
      return { changes: { pendingTargetIds: [...kept, ...values.filter(id => chunk.has(id))] } };
    }
    return undefined;
  }
  if (prop.type === 'spell' && session.casting === undefined) {
    const castings = await castingsOf(session.creatureId, prop);
    if (castings === 'none') return undefined;
    // Its slots spent since: nothing left to cast it with
    if (!castings.options.length) return { refusal: t(language, 'noSlot', { name, action }) };
    const allowed = castings.options.map(option => option.value);
    if (what === 'sok' && castings.first && allowed.includes(castings.first)) return { changes: { casting: castings.first } };
    if (what === 'ssel' && values.length === 1 && allowed.includes(values[0])) return { changes: { casting: values[0] } };
    return undefined;
  }
  if (!session.actionId) {
    const need = await ammoNeed(session.creatureId, prop, session.ammoChosen);
    if (!need || 'none' in need) return undefined;
    const chosen = what === 'aok' && Number(arg) === need.index ? need.current?._id
      : what === 'asel' && arg?.startsWith(`${need.index}x`) && values.length === 1 ? values[0] : undefined;
    if (!chosen || !need.items.some(item => item._id === chosen)) return undefined;
    if (chosen !== need.consumed.itemId) {
      // As the sheet chooses it: kept on the action, then the sheet computed
      // again, which says whether there is enough of it
      try {
        await (selectAmmoItem as any)._execute(invocationOf(user._id), { actionId: prop._id, itemId: chosen, itemConsumedIndex: need.index });
        await reloadCachedProperties(session.creatureId);
        await computeCreature(session.creatureId);
        await reloadCachedProperties(session.creatureId);
      } catch (e) {
        return { refusal: errorText(language, e) };
      }
    }
    return { changes: { ammoChosen: [...session.ammoChosen || [], need.index] } };
  }
  const pending = session.pending;
  if (!pending) return undefined;
  if (pending.kind === 'choose' && what === 'cnone') {
    return { changes: { decisions: [...session.decisions, { kind: 'choose', value: [] }] }, unset: ['pending'] };
  }
  if (pending.kind === 'choose' && what === 'csel' && values.length === 1 && pending.ids.includes(values[0])) {
    return { changes: { decisions: [...session.decisions, { kind: 'choose', value: values }] }, unset: ['pending'] };
  }
  return undefined;
}

/** Everything a click is checked against: the account, the character, the action, the targets, the engine's action */
async function recheck(session: ActionSession, user: LinkedUser, language: Language): Promise<
  { creature: CommandCreature, prop: ActionProp } | { refusal: string }
> {
  const creature = await commandCreature(session.creatureId);
  if (!creature || !mayUse(creature, user)) return { refusal: say(language, 'denied') };
  const prop = await actionOf(session.creatureId, session.propId);
  if (!prop) return { refusal: t(language, 'actionGone', { name: escapeMarkdown(creature.name || '?') }) };
  const task = { subtaskFn: prop.type === 'spell' ? 'castSpell' as const : undefined };
  for (const targetId of prop.target === 'self' ? [] : session.targetIds || []) {
    const target = await getCreature(targetId);
    try {
      await assertMayTarget(creature as any, target as any, user._id, task);
    } catch {
      return { refusal: t(language, 'targetDenied', { target: escapeMarkdown(target?.name || '?'), action: escapeMarkdown(title(prop)) }) };
    }
  }
  if (session.actionId && !(await EngineActions.findOneAsync({ _id: session.actionId, creatureId: session.creatureId }, { fields: { _id: 1 } }))) {
    return { refusal: t(language, 'replaced', { name: escapeMarkdown(creature.name || '?') }) };
  }
  return { creature, prop };
}

/** A click on one of /action's menus: a select or a button whose custom_id is `dc:act:…` */
export async function handleActionComponent(interaction: Interaction): Promise<Handled> {
  const customId = interaction.data?.custom_id || '';
  const context = await interactionContext(interaction);
  const { language } = context;
  const match = CUSTOM_ID.exec(customId);
  if (!match) return reply(textMessage(t(language, 'stale')));
  if (!context.user) return reply(notLinkedMessage(language));
  const [, sessionId, stepText, what, arg] = match;
  const session = await readSession(sessionId);
  if (!session) {
    // Past its 15 minutes, before Mongo's TTL removed it: its engine's action goes with it
    const expired = await DiscordActionSessions.findOneAsync(sessionId);
    if (expired) await abandon(expired);
    return update(closedMessage(t(language, 'expired')));
  }
  if (session.discordUserId !== context.discordUserId) return reply(textMessage(t(language, 'notYours')));
  if (session.userId !== context.user._id) {
    await abandon(session);
    return update(closedMessage(say(language, 'denied')));
  }
  if (Number(stepText) !== session.step) return reply(textMessage(t(language, 'stale')));
  const checked = await recheck(session, context.user, language);
  if ('refusal' in checked) {
    await abandon(session);
    return update(closedMessage(checked.refusal));
  }
  const { creature, prop } = checked;
  if (what === 'cancel') {
    await abandon(session);
    return update(closedMessage(t(language, 'cancelled', { action: escapeMarkdown(title(prop)) })));
  }
  const values = (Array.isArray(interaction.data?.values) ? interaction.data.values : [])
    .filter((value): value is string => typeof value === 'string' && /^[\w-]{1,32}$/.test(value)).slice(0, 25);
  const answer = await answerOf({ session, creature, user: context.user, language }, prop, what, arg, values);
  if (!answer) return reply(textMessage(t(language, 'stale')));
  if ('refusal' in answer) {
    await abandon(session);
    return update(closedMessage(answer.refusal));
  }
  const answered = await answerSession(session, answer.changes, answer.unset);
  // Another click of the same menu was first
  if (!answered) return reply(textMessage(t(language, 'stale')));
  const step: Step = { session: answered, creature, user: context.user, language };
  // The targets just chosen: the server's rule, before anything else
  if (answer.changes.targetIds) {
    const again = await recheck(answered, context.user, language);
    if ('refusal' in again) {
      await abandon(answered);
      return update(closedMessage(again.refusal));
    }
  }
  const work = nextScreen(step);
  const screen = await within(work);
  const target = { applicationId: interaction.application_id, token: interaction.token };
  const action = escapeMarkdown(title(prop));
  if (screen && 'menu' in screen) {
    const menu = screen.menu as { content: string };
    return update(answer.notice ? { ...menu, content: `${answer.notice}\n${menu.content}` } : menu);
  }
  if (screen && 'refusal' in screen) {
    await abandon(answered);
    return update(closedMessage(screen.refusal));
  }
  if (screen && 'run' in screen) {
    return {
      response: { type: RESPONSE.updateMessage, data: withoutEphemeral(closedMessage(t(language, 'running', { action }))) },
      after: () => finish(step, target, context.channelId, 'menu'),
    };
  }
  return {
    response: { type: RESPONSE.deferredUpdate },
    after: async () => {
      const late = await work.catch(e => ({ refusal: errorText(language, e) }));
      if ('menu' in late) await editOriginal(target, withoutEphemeral(late.menu));
      else if ('refusal' in late) {
        await abandon(answered);
        await editOriginal(target, withoutEphemeral(closedMessage(late.refusal)));
      } else await finish(step, target, context.channelId, 'menu');
    },
  };
}

// ---------------------------------------------------------------- autocomplete

const choices = (list: { name: string, value: string }[]) => ({ response: { type: RESPONSE.autocomplete, data: { choices: list.slice(0, 25) } } });

/** /action's options being typed: its actions and spells, its targets, its characters */
export async function handleActionAutocomplete(interaction: Interaction): Promise<Handled> {
  const focused = interaction.data?.options?.find(option => option.focused);
  if (focused?.name !== 'action' && focused?.name !== 'target') return handleAutocomplete(interaction);
  const context = await interactionContext(interaction);
  if (!context.user) return choices([]);
  const user = context.user;
  const resolved = await commandCharacter({
    user, discordUserId: context.discordUserId, guildId: context.guildId, party: context.party, option: optionOf(interaction, 'character'),
  });
  if (!('creature' in resolved) || !mayUse(resolved.creature, user)) return choices([]);
  const creature = resolved.creature;
  const query = (typeof focused.value === 'string' ? focused.value : '').trim().toLowerCase();
  if (focused.name === 'action') {
    const props = await actionsOf(creature._id);
    return choices(props
      .filter(prop => !query || title(prop).toLowerCase().includes(query))
      .slice(0, 25)
      .map(prop => ({ name: actionChoiceName(prop, context.language), value: prop._id })));
  }
  // The targets: those of all its parties, as "Target…" offers them; none for an action on itself
  const typedAction = optionOf(interaction, 'action');
  const prop = typedAction ? await namedAction(creature._id, typedAction) : undefined;
  if (prop && 'prop' in prop && prop.prop.target === 'self') return choices([]);
  const candidates = await candidatesIn(creature._id, await partiesOfCreature(creature._id), user);
  return choices(candidates
    .filter(candidate => !query || (candidate.name || '').toLowerCase().includes(query))
    .map(candidate => {
      const kind = candidate._id === creature._id ? app(context.language, 'targetPicker.meSuffix')
        : `(${t(context.language, candidate.kind === 'monster' ? 'kindMonster' : 'kindCharacter')})`;
      return { name: `${candidate.name?.trim() || '?'} ${kind}`.slice(0, 100), value: candidate._id };
    }));
}

