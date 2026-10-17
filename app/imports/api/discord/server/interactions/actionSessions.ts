import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import type { Decision } from '/imports/api/engine/action/functions/userInput/saveInputChoices';

/*
 * /action's state between its menus (D6), on the server: which character
 * runs which action for which Discord user, the targets, the spell slot and
 * the ammunition chosen, the engine's action once inserted, the decisions
 * made so far, and the question its menu asks. A menu's custom_id names the
 * session and its step, nothing else, and nothing in it is trusted: every
 * click is checked again (interactionActions.ts).
 *
 * A session lasts 15 minutes after its last answer, as long as the token of
 * the click that showed its menu: past that, its menu can no longer be
 * edited. Mongo's TTL index removes it within a minute or so of that; until
 * then it is read as gone all the same.
 *
 * And the last targets of each action run with /action, by DiceCloud user,
 * which its target menu preselects during a fight, as the sheet's picker does
 * from the browser's own memory (stores/targetSelection.js): 30 days.
 */

export const SESSION_LIFETIME_MS = 15 * 60 * 1000;
export const LAST_TARGETS_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** What a menu waits for: one of the action's choices, its values the answer must be among */
export type PendingInput = { kind: 'choose', ids: string[], count: number };

export type ActionSession = {
  _id: string,
  // Who: the Discord user who ran the command, the DiceCloud account linked then
  discordUserId: string,
  userId: string,
  // What: the character and its action or spell
  creatureId: string,
  propId: string,
  // Its result for its user alone
  secret: boolean,
  // The command's `advantage` option: every roll of the action with it,
  // rather than as the sheet suggests
  advantage?: -1 | 0 | 1,
  // Where the command ran, where its result goes
  channelId?: string,
  // Goes up with each answer: a menu of another step is no longer current
  step: number,
  // The targets, once chosen; while several are being ticked, those ticked
  targetIds?: string[],
  pendingTargetIds?: string[],
  // The fighting parties' creatures alone in the menu (it opened by itself)
  fighting?: boolean,
  // How the spell is cast, once chosen (castingSlots.ts)
  casting?: string,
  // The indexes of the action's items consumed whose ammunition was chosen
  ammoChosen?: number[],
  // The engine's action, once inserted, and the decisions made since
  actionId?: string,
  decisions: Decision[],
  pending?: PendingInput,
  expiresAt: Date,
  createdAt: Date,
};

/** The sessions of /action. Server only */
export const DiscordActionSessions = new Mongo.Collection<ActionSession>('discordActionSessions');

type LastTargets = { _id: string, userId: string, propId: string, targetIds: string[], at: Date };

/** The last targets of each action run with /action. Server only */
export const DiscordActionTargets = new Mongo.Collection<LastTargets>('discordActionTargets');

if (Meteor.isServer) {
  Meteor.startup(async () => {
    await DiscordActionSessions.rawCollection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await DiscordActionTargets.rawCollection().createIndex({ at: 1 }, { expireAfterSeconds: LAST_TARGETS_LIFETIME_MS / 1000 });
    await DiscordActionTargets.rawCollection().createIndex({ userId: 1 });
  });
}

const expiry = (now = Date.now()) => new Date(now + SESSION_LIFETIME_MS);

/** Starts a session; returns it */
export async function startSession(fields: Omit<ActionSession, '_id' | 'step' | 'decisions' | 'expiresAt' | 'createdAt'>): Promise<ActionSession> {
  const session: ActionSession = {
    ...fields, _id: Random.id(), step: 0, decisions: [], expiresAt: expiry(), createdAt: new Date(),
  };
  await DiscordActionSessions.insertAsync(session);
  return session;
}

/** The session a menu names, while it lasts */
export async function readSession(sessionId: string): Promise<ActionSession | undefined> {
  const session = await DiscordActionSessions.findOneAsync(sessionId);
  if (!session || session.expiresAt.getTime() <= Date.now()) return undefined;
  return session;
}

/**
 * The answer to the session's menu at `step`, once: its changes are written
 * and the step goes up only if the session is still at that step (a second
 * click on the same menu finds it moved on). Returns the session as written,
 * or undefined when another click was first
 */
export async function answerSession(
  session: ActionSession, changes: Partial<Omit<ActionSession, '_id' | 'step'>>, unset: (keyof ActionSession)[] = [],
): Promise<ActionSession | undefined> {
  const next = { ...changes, expiresAt: expiry() };
  const updated = await DiscordActionSessions.updateAsync({ _id: session._id, step: session.step }, {
    $set: next as any,
    $inc: { step: 1 },
    ...unset.length && { $unset: Object.fromEntries(unset.map(key => [key, 1])) },
  });
  if (!updated) return undefined;
  const written = { ...session, ...next, step: session.step + 1 };
  for (const key of unset) delete written[key];
  return written;
}

/** Writes what a step learned without moving the step (an automatic choice, the action inserted, the question asked) */
export async function noteSession(session: ActionSession, changes: Partial<Omit<ActionSession, '_id' | 'step'>>) {
  Object.assign(session, changes);
  await DiscordActionSessions.updateAsync({ _id: session._id, step: session.step }, { $set: changes as any });
}

/** Ends a session: run, cancelled, refused */
export async function endSession(sessionId: string) {
  await DiscordActionSessions.removeAsync(sessionId);
}

const lastKey = (userId: string, propId: string) => `${userId}:${propId}`;

/** The targets the user last ran the action with from Discord; none is a choice too */
export async function lastTargets(userId: string, propId: string): Promise<string[] | undefined> {
  const last = await DiscordActionTargets.findOneAsync(lastKey(userId, propId));
  if (!last || Date.now() - last.at.getTime() > LAST_TARGETS_LIFETIME_MS) return undefined;
  return last.targetIds;
}

export async function rememberTargets(userId: string, propId: string, targetIds: string[]) {
  await DiscordActionTargets.upsertAsync(lastKey(userId, propId), { $set: { userId, propId, targetIds, at: new Date() } });
}

/** Forgets a user's sessions and last targets: they unlinked their Discord account, or deleted theirs */
export async function forgetActionSessions(userId: string) {
  await DiscordActionSessions.removeAsync({ userId });
  await DiscordActionTargets.removeAsync({ userId });
}
