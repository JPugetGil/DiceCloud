import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import '/imports/startup/server/publicationRateLimit';

/*
 * The subscriptions' rate limit counts each connection's own: one counter
 * for the whole server let any client, signed in or not, refuse everyone
 * else's sheets and boards with 50 subscriptions every 10 seconds.
 */
if (Meteor.isServer) describe('Subscription rate limit', function () {
  this.timeout(30000);

  before(function () {
    Meteor.publish('rateLimitProbe', function () {
      this.ready();
    });
  });

  const subscribe = (connection: any, arg: number) => new Promise<void>((resolve, reject) => {
    connection.subscribe('rateLimitProbe', arg, {
      onReady: () => resolve(),
      onStop: (error: any) => error && reject(error),
    });
  });

  it('limits a connection that floods it, not the others', async function () {
    const flooding = DDP.connect(Meteor.absoluteUrl());
    const other = DDP.connect(Meteor.absoluteUrl());
    try {
      const results = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => subscribe(flooding, i)));
      assert.isTrue(results.some(result => result.status === 'rejected'
        && (result.reason as any)?.error === 'too-many-requests'), 'the flooding connection is limited');
      await subscribe(other, -1);
    } finally {
      flooding.disconnect();
      other.disconnect();
    }
  });
});
