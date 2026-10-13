import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { Accounts } from 'meteor/accounts-base';

/**
 * A DDP connection to the test server, signed in as the user, as a browser
 * connects: what it calls goes through the method's checks and rate limits,
 * and `messages` holds every message it receives, parsed. Server only.
 */
export async function openAs(userId: string) {
  const connection = DDP.connect(Meteor.absoluteUrl());
  const messages: any[] = [];
  (connection as any)._stream.on('message', (raw: string) => messages.push(JSON.parse(raw)));
  const accounts = Accounts as any;
  const stamped = accounts._generateStampedLoginToken();
  await accounts._insertLoginToken(userId, stamped);
  await connection.callAsync('login', { resume: stamped.token });
  /** Resolves once the publication is ready, rejects with its error */
  const subscribe = (name: string, ...args: any[]) => new Promise<Meteor.SubscriptionHandle>((resolve, reject) => {
    const handle: Meteor.SubscriptionHandle = connection.subscribe(name, ...args, {
      onReady: () => resolve(handle),
      onStop: (error: unknown) => error && reject(error),
    });
  });
  /** The method's result, or the error it was refused with */
  const call = (name: string, ...args: any[]) => connection.callAsync(name, ...args);
  return { connection, messages, subscribe, call, close: () => connection.disconnect() };
}

/** The error a promise rejects with, undefined if it resolves */
export async function refusal(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  return undefined;
}

/** What a connection received of a document: every message about it */
export const about = (messages: any[], collection: string, id: string) => messages
  .filter(message => message.collection === collection && message.id === id);
