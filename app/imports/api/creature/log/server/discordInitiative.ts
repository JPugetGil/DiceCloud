import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { hidesStatsFromPlayers } from '/imports/api/creature/creatureFolders/boardMonsters';
import { parseWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';
import {
  combatStart, combatSummary, initiativeMessage, turnLine, type InitiativeRow,
} from '/imports/api/creature/log/discord/partyMessages';
import { publishes, type PublishKind } from '/imports/api/creature/log/discord/partyPublishing';
import { DISCORD_CODES, postMessage, type Requester, type WebhookSender } from '/imports/api/creature/log/server/webhookSender';
import {
  creatureFolders, deliver, partyChannel, webhookSender, type Channel, type PartyFolderDoc,
} from '/imports/api/creature/log/server/discordWebhooks';

/*
 * A party's fight on its Discord channel (D2). When it starts, the initiative
 * message says so ("Combat — round 1"): the order, the round, whose turn it
 * is, each creature's conditions. Discord returns its id (wait=true), which
 * the folder keeps, and at each turn and change of the tracker the message is
 * edited in place. Each turn also posts a short line naming whose turn it is,
 * the one that notifies. When the fight ends, the message shows it is over
 * and a summary follows. The game master chooses which of those the channel
 * gets (partyPublishing.ts: initiative, turns, combat); without the
 * initiative message, a line says the fight starts.
 *
 * What the channel shows is what the players see on the board: never a
 * monster's hit points, armor class or health (partyMessages.ts).
 *
 * The party's webhook queue keeps the order. The initiative message is drawn
 * from the folder when its request leaves, so changes in quick succession
 * make one edit; a turn's line says whose turn it was when it moved.
 */

export type InitiativeChange = 'start' | 'update' | 'turn' | 'end';

type Tracker = NonNullable<PartyFolderDoc['initiative']>;


/**
 * The tracker's creatures in initiative order, as the channel shows them:
 * their current names, whether each is a character of the party, its
 * conditions (the buffs its libraries tag `condition`)
 */
export async function initiativeRows(tracker: Tracker | undefined): Promise<InitiativeRow[]> {
  const order = initiativeOrder(tracker?.entries || []);
  const ids = order.map(entry => entry.creatureId).filter((id): id is string => !!id);
  const creatures = ids.length ? await Creatures.find(
    { _id: { $in: ids } }, { fields: { name: 1, type: 1 } },
  ).fetchAsync() : [];
  const conditions = ids.length ? await CreatureProperties.find({
    'root.id': { $in: ids },
    type: 'buff',
    tags: 'condition',
    removed: { $ne: true },
    inactive: { $ne: true },
  }, { fields: { name: 1, root: 1 }, sort: { left: 1 } }).fetchAsync() : [];
  return order.map(entry => {
    const creature = creatures.find(creature => creature._id === entry.creatureId);
    return {
      name: creature?.name || entry.name || '?',
      ...Number.isFinite(entry.initiative) && { initiative: entry.initiative },
      ...entry.out && { out: true },
      character: !!creature && !hidesStatsFromPlayers(creature),
      conditions: conditions
        .filter(condition => condition.root?.id === entry.creatureId && condition.name)
        .map(condition => condition.name as string),
    };
  });
}

// The folder's fight and Discord setting, as they are when read
async function readFolder(folderId: string) {
  const CreatureFolders = await creatureFolders();
  return CreatureFolders.findOneAsync(folderId, {
    fields: { name: 1, owner: 1, initiative: 1, discord: 1 },
  });
}

/** Edits the initiative message, or posts it when there is none on this webhook yet */
async function showInitiative(request: Requester, channel: Channel, folderId: string) {
  const folder = await readFolder(folderId);
  const tracker = folder?.initiative;
  if (!folder || !tracker?.round) return;
  const message = initiativeMessage({
    rows: await initiativeRows(tracker), round: tracker.round, turn: tracker.turn || 0, language: channel.language,
  });
  const stored = folder.discord?.initiative;
  if (stored?.webhookId === channel.webhook.id) {
    const edited = await postMessage(request, { body: message, messageId: stored.messageId, threadId: stored.threadId });
    if (edited.ok || edited.gone) return;
    // Deleted in Discord: a new one
    const deleted = edited.code === DISCORD_CODES.unknownMessage || edited.code === DISCORD_CODES.unknownChannel;
    if (!deleted) {
      console.warn(`Discord webhook ${channel.webhook.id}: initiative not edited, ${edited.status}: ${edited.detail}`);
      return;
    }
  }
  const posted = await deliver(request, channel, { body: message, wait: true });
  if (!posted.ok || !posted.message?.id) return;
  const CreatureFolders = await creatureFolders();
  await CreatureFolders.updateAsync(folderId, {
    $set: {
      'discord.initiative': {
        webhookId: channel.webhook.id,
        messageId: posted.message.id,
        ...posted.threadId && { threadId: posted.threadId },
      },
    },
  });
}

/**
 * The fight is over: the initiative message says so, without anyone's turn,
 * and a summary follows, each if the game master publishes it
 */
async function endFight(request: Requester, channel: Channel, folderId: string, tracker: Tracker) {
  const folder = await readFolder(folderId);
  const rows = await initiativeRows(tracker);
  const round = tracker.round || 0;
  const stored = folder?.discord?.initiative;
  if (stored?.webhookId === channel.webhook.id && publishes(folder?.discord, 'initiative')) {
    await postMessage(request, {
      body: initiativeMessage({ rows, round, turn: 0, language: channel.language, ended: true }),
      messageId: stored.messageId,
      threadId: stored.threadId,
    });
  }
  if (publishes(folder?.discord, 'combat')) {
    await deliver(request, channel, {
      body: combatSummary({ rows, round, language: channel.language, partyName: folder?.name }),
    });
  }
  if (stored) {
    const CreatureFolders = await creatureFolders();
    await CreatureFolders.updateAsync(
      { _id: folderId, 'discord.initiative.messageId': stored.messageId },
      { $unset: { 'discord.initiative': 1 } },
    );
  }
}

// The folders whose initiative message waits to be drawn: a change made
// meanwhile shows in it
const waiting = new Set<string>();
// One lookup at a time per folder: its changes keep their order
const intake = new Map<string, Promise<void>>();

async function queueChange(folderId: string, change: InitiativeChange, ended: Tracker | undefined, target: WebhookSender) {
  const folder = await readFolder(folderId);
  const webhook = parseWebhookURL(folder?.discord?.webhook);
  if (!folder || !webhook || target.isGone(webhook)) return;
  if (change === 'end' ? !ended?.round : !folder.initiative?.round) return;
  const on = (kind: PublishKind) => publishes(folder.discord, kind);
  if (!on('initiative') && !on('turns') && !on('combat')) return;
  const channel = await partyChannel(folder, webhook);
  if (change === 'start' && folder.discord?.initiative) {
    // A new fight: a new message, not the last fight's
    const CreatureFolders = await creatureFolders();
    await CreatureFolders.updateAsync(folderId, { $unset: { 'discord.initiative': 1 } });
  }
  if (change === 'end') {
    if (on('initiative') || on('combat')) {
      target.enqueue(webhook, request => endFight(request, channel, folderId, ended as Tracker));
    }
    return;
  }
  // Whose turn it is now, for its line
  let line: ReturnType<typeof turnLine>;
  if (change !== 'update' && on('turns')) {
    const rows = await initiativeRows(folder.initiative);
    line = turnLine(rows[folder.initiative?.turn || 0], channel.language);
  }
  // The initiative message says the fight starts; without it, a line does
  const start = change === 'start' && on('combat') && !on('initiative') ? combatStart(channel.language) : undefined;
  const show = on('initiative');
  if (!start && !line && (!show || waiting.has(folderId))) return;
  if (show) waiting.add(folderId);
  target.enqueue(webhook, async request => {
    if (start) await deliver(request, channel, { body: start });
    if (show) {
      waiting.delete(folderId);
      await showInitiative(request, channel, folderId);
    }
    if (line) await deliver(request, channel, { body: line });
  });
}

/**
 * Tells the party's Discord channel that its initiative tracker changed:
 * `start` a fight, `turn` a new turn, `update` anything else in it, `end` the
 * fight, with the tracker as it was. Returns at once; nothing without a
 * webhook. Server only, after the change is written.
 */
export function initiativeChanged(folderId: string, change: InitiativeChange, ended?: Tracker) {
  const target = webhookSender();
  if (!target || !folderId) return;
  const next = (intake.get(folderId) ?? Promise.resolve())
    .then(() => queueChange(folderId, change, ended, target))
    .catch(e => console.error(e));
  intake.set(folderId, next);
  next.finally(() => {
    if (intake.get(folderId) === next) intake.delete(folderId);
  });
}

/** Resolves once the changes so far are queued (for tests) */
export async function initiativeIntakeIdle() {
  while (intake.size) await Promise.all([...intake.values()]);
}
