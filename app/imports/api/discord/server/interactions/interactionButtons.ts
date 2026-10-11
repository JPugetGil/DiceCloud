import type { Mongo } from 'meteor/mongo';
import Creatures from '/imports/api/creature/creatures/Creatures';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { escapeMarkdown } from '/imports/api/creature/log/discord/partyMessages';
import { IS_COMPONENTS_V2 } from '/imports/api/creature/log/discord/discordMessages';
import { editOriginal, followUp } from '/imports/api/discord/server/interactions/interactionApi';
import {
  commandCreature, isGameMasters, mayUse, type LinkedUser,
} from '/imports/api/discord/server/interactions/interactionCharacters';
import {
  EPHEMERAL, RESPONSE, notLinkedMessage, say, textMessage,
} from '/imports/api/discord/server/interactions/interactionReplies';
import { findReroll } from '/imports/api/discord/server/interactions/interactionRerolls';
import {
  entryReply, interactionContext, runCheck, runRoll, type Handled, type Interaction,
} from '/imports/api/discord/server/interactions/interactionCommands';

/*
 * The buttons of D7, on the replies to commands and on the messages of the
 * webhooks "Connect to Discord" made (an application's own; a pasted webhook
 * refuses any button, so its messages never have one):
 *
 * - dc:reroll:<id>:<1|-1>, "Reroll with advantage / disadvantage", under a
 *   check, a saving throw or a roll of a single d20: the same roll again, in
 *   the character's log, in a new message;
 * - dc:next:<folder>:<round>:<turn>, "Next turn", under the initiative
 *   message: the party's game master alone;
 * - dc:end:<folder>:<entry>:<round>, "End my turn", under a character's turn
 *   line: its player (whoever may edit the character) or the game master.
 *
 * A custom_id only names a document and where the fight was: everything is
 * read again at each click, the rights too. A button whose roll is gone, or
 * whose turn is over, says it is no longer current, and goes from its message
 * when it can.
 */

const CUSTOM_ID = {
  reroll: /^dc:reroll:(\w{1,32}):(1|-1)$/,
  next: /^dc:next:(\w{1,32}):(\d{1,6}):(\d{1,6})$/,
  end: /^dc:end:(\w{1,32}):(\w{1,32}):(\d{1,6})$/,
};

type FolderDoc = {
  _id: string, owner?: string,
  initiative?: { round?: number, turn?: number, entries?: { _id: string, creatureId?: string, name?: string, out?: boolean }[] },
};

const ephemeral = (content: string): Handled => ({ response: { type: RESPONSE.message, data: textMessage(content) } });

/** "No longer current": for its user alone, and the button goes from a plain message (not a card, whose components are its text) */
function stale(interaction: Interaction, language: Parameters<typeof say>[0]): Handled {
  const text = say(language, 'stale');
  const card = ((interaction.message?.flags ?? 0) & IS_COMPONENTS_V2) !== 0;
  if (card || !interaction.message) return ephemeral(text);
  return {
    response: { type: RESPONSE.updateMessage, data: { components: [] } },
    after: async () => {
      await followUp({ applicationId: interaction.application_id, token: interaction.token }, textMessage(text));
    },
  };
}

// The tracker's methods, imported when called: they import the folders and the log
async function advance(folder: FolderDoc, userId: string) {
  const { advanceTracker } = await import('/imports/api/creature/creatureFolders/methods/initiativeMethods');
  return advanceTracker(folder, 1, userId);
}

async function readFolder(folderId: string): Promise<FolderDoc | undefined> {
  const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
  return await (CreatureFolders as unknown as Mongo.Collection<FolderDoc>).findOneAsync(folderId, { fields: { owner: 1, initiative: 1 } });
}

/** The current turn's entry, if the fight is still at that round */
function currentEntry(folder: FolderDoc | undefined, round: number) {
  const tracker = folder?.initiative;
  if (!tracker?.round || tracker.round !== round || !tracker.entries?.length) return undefined;
  return initiativeOrder(tracker.entries)[tracker.turn || 0] as { _id: string, creatureId?: string, name?: string } | undefined;
}

/** A click on one of DiceCloud's buttons */
export async function handleButton(interaction: Interaction): Promise<Handled> {
  const customId = interaction.data?.custom_id || '';
  const context = await interactionContext(interaction);
  const { language } = context;
  if (!context.user) return { response: { type: RESPONSE.message, data: notLinkedMessage(language) } };
  const user = context.user as LinkedUser;

  let match = CUSTOM_ID.reroll.exec(customId);
  if (match) {
    const [, rerollId, sign] = match;
    const reroll = await findReroll(rerollId);
    const creature = reroll && await commandCreature(reroll.creatureId);
    if (!reroll || !creature) return stale(interaction, language);
    if (!mayUse(creature, user)) {
      return ephemeral(say(language, 'buttonDenied', { name: escapeMarkdown(creature.name || '?') }));
    }
    const advantage = Number(sign);
    const secret = reroll.secret || isGameMasters(creature);
    return {
      // A new message, for its user alone if the first one was
      response: { type: RESPONSE.deferredMessage, ...secret && { data: { flags: EPHEMERAL } } },
      after: async () => {
        let message: Record<string, unknown>;
        try {
          const origin = { channelId: context.channelId, logs: [] };
          const entry = reroll.kind === 'roll'
            ? await runRoll(user, creature, reroll.roll || '', advantage, origin)
            : await runCheck(user, creature, {
              skillVariableName: reroll.skillVariableName, abilityVariableName: reroll.abilityVariableName,
            }, advantage, origin);
          const { _id, createdAt, ...again } = reroll; // eslint-disable-line @typescript-eslint/no-unused-vars
          message = await entryReply({ entry, creature, language, reroll: again });
        } catch (e) {
          message = textMessage(say(language, 'failed', { error: String((e as { reason?: string })?.reason || (e as Error)?.message || e).slice(0, 300) }));
        }
        const { flags, ...rest } = message as { flags?: number };
        const kept = (flags ?? 0) & ~EPHEMERAL;
        await editOriginal(context.target, { ...rest, ...kept && { flags: kept } });
      },
    };
  }

  match = CUSTOM_ID.next.exec(customId);
  if (match) {
    const [, folderId, round, turn] = match;
    const folder = await readFolder(folderId);
    if (!folder?.initiative?.round) return stale(interaction, language);
    if (folder.owner !== user._id) return ephemeral(say(language, 'nextTurnDenied'));
    if (folder.initiative.round !== Number(round) || (folder.initiative.turn || 0) !== Number(turn)) {
      return ephemeral(say(language, 'stale'));
    }
    return {
      // The initiative message is edited in place, as at every turn
      response: { type: RESPONSE.deferredUpdate },
      after: async () => {
        await advance(folder, user._id);
      },
    };
  }

  match = CUSTOM_ID.end.exec(customId);
  if (match) {
    const [, folderId, entryId, round] = match;
    const folder = await readFolder(folderId);
    const entry = currentEntry(folder, Number(round));
    if (!folder || !entry || entry._id !== entryId) return stale(interaction, language);
    const creature = entry.creatureId ? await Creatures.findOneAsync(entry.creatureId, {
      fields: { name: 1, owner: 1, writers: 1, type: 1 },
    }) : undefined;
    const allowed = folder.owner === user._id || (!!creature && mayUse(creature as any, user));
    if (!allowed) {
      return ephemeral(say(language, 'endTurnDenied', { name: escapeMarkdown(creature?.name || entry.name || '?') }));
    }
    return {
      // The line's button goes: the turn is over
      response: { type: RESPONSE.updateMessage, data: { components: [] } },
      after: async () => {
        await advance(folder, folder.owner || user._id);
      },
    };
  }

  return ephemeral(say(language, 'stale'));
}
