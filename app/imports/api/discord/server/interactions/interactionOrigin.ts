import { Meteor } from 'meteor/meteor';

/*
 * What a Discord command or button (D6, D7) is running for, while it runs:
 * the channel its reply goes to, and the log entries it writes. The log
 * (sendLogToDiscord) reads it when an entry is written, in the same
 * asynchronous context: the entry is then not posted again by a webhook into
 * that same channel (it still goes to the others), and the reply is drawn from
 * the entries kept here. A secret command's entries go to no webhook at all:
 * its reply, for its user alone, and the character's log are the only places
 * they show.
 */

export type LoggedEntry = { _id?: string, creatureId?: string, content?: any[], date?: Date | string };

export type InteractionOrigin = {
  // Where the reply goes: the interaction's channel (or thread)
  channelId?: string,
  // The entries written meanwhile, in order
  logs: LoggedEntry[],
  // For its user alone (the `secret` option, a game master's creature)
  secret?: boolean,
};

const current = new Meteor.EnvironmentVariable<InteractionOrigin>();

/** Runs `work` as a command of this origin: the log entries it writes are kept, and not posted again there */
export function withInteractionOrigin<T>(origin: InteractionOrigin, work: () => Promise<T>): Promise<T> {
  return current.withValue(origin, work);
}

/** The command the code runs for, if any */
export function interactionOrigin(): InteractionOrigin | undefined {
  return current.get();
}
