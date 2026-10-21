import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
// As the server's startup sets it up: the route, its errors answered as JSON
import '/imports/startup/server/simpleRestConfig';

/*
 * POST /api/login escapes DDP's rate limits: without its own, anyone could try
 * passwords as fast as the server hashes them, and tell the accounts that
 * exist from the ones that don't by the answer.
 */
const login = async (body: object) => {
  const response = await fetch(Meteor.absoluteUrl('api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as { error?: string, reason?: string, token?: string } };
};

if (Meteor.isServer) describe('REST login', function () {
  this.timeout(30000);
  const username = `rest-${Random.id(6)}`.toLowerCase();
  let userId: string;

  before(async function () {
    userId = await Accounts.createUserAsync({ username, password: 'correct horse' });
  });

  after(async function () {
    await Meteor.users.removeAsync(userId);
  });

  it('answers an unknown account as a wrong password', async function () {
    const unknown = await login({ username: `nobody-${Random.id(6)}`, password: 'x' });
    const wrong = await login({ username, password: 'wrong' });
    assert.equal(unknown.status, wrong.status);
    assert.deepEqual(unknown.body, wrong.body, 'the same answer: no account to learn of');
    assert.notExists(wrong.body.token);
  });

  it('stops trying passwords after a few attempts', async function () {
    let limited;
    for (let attempt = 0; attempt < 8 && !limited; attempt++) {
      const answer = await login({ username, password: `guess-${attempt}` });
      if (answer.status === 429) limited = answer;
    }
    assert.exists(limited, 'a 429 within 8 attempts');
    assert.equal(limited!.body.error, 'too-many-requests');
    // The right password too, while limited
    assert.equal((await login({ username, password: 'correct horse' })).status, 429);
  });
});

if (Meteor.isServer) describe('REST client address', function () {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { default: requestClientAddress } = require('/imports/api/rest/server/requestClientAddress');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const request = (forwardedFor?: string) => ({
    socket: { remoteAddress: '10.0.0.2' },
    headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
  });
  const withCount = (count: string | undefined, run: () => void) => {
    const before = process.env.HTTP_FORWARDED_COUNT;
    if (count === undefined) delete process.env.HTTP_FORWARDED_COUNT;
    else process.env.HTTP_FORWARDED_COUNT = count;
    try {
      run();
    } finally {
      if (before === undefined) delete process.env.HTTP_FORWARDED_COUNT;
      else process.env.HTTP_FORWARDED_COUNT = before;
    }
  };

  it('reads the socket without proxies', function () {
    withCount(undefined, () => assert.equal(requestClientAddress(request('1.2.3.4')), '10.0.0.2'));
  });

  it('reads as many entries from the end of X-Forwarded-For as there are proxies', function () {
    // Behind the tunnel: the visitor's address is the last entry; one sent by the visitor comes before
    withCount('1', () => assert.equal(requestClientAddress(request('6.6.6.6, 1.2.3.4')), '1.2.3.4'));
    withCount('2', () => assert.equal(requestClientAddress(request('6.6.6.6, 1.2.3.4, 10.0.0.1')), '1.2.3.4'));
    withCount('2', () => assert.isNull(requestClientAddress(request('1.2.3.4'))));
    withCount('1', () => assert.isNull(requestClientAddress(request())));
  });
});
