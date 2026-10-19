import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { checkSignature, interactionsPublicKey } from '/imports/api/discord/server/interactions/interactionSignature';
import {
  handleAutocomplete, handleCommand, interactionContext, type Handled, type Interaction,
} from '/imports/api/discord/server/interactions/interactionCommands';
import { handleButton } from '/imports/api/discord/server/interactions/interactionButtons';
import {
  handleActionAutocomplete, handleActionCommand, handleActionComponent,
} from '/imports/api/discord/server/interactions/interactionActions';
import { RESPONSE, interactionLanguage, say, textMessage } from '/imports/api/discord/server/interactions/interactionReplies';
import '/imports/api/discord/server/interactions/commandRegistration';
// The bot (phase D): its setting, which the browser learns of
import '/imports/api/discord/server/botClient';

/*
 * The Interactions Endpoint URL of DiceCloud's application (D6, D7):
 * <ROOT_URL>/discord/interactions, where Discord POSTs the slash commands,
 * their autocompletions and the clicks on the buttons, without any bot. Only
 * with `discord.publicKey` in the settings: each request's signature is
 * checked on its raw body (interactionSignature.ts), before the app's body
 * parsers read it, hence a raw handler. A PING gets its PONG; the rest is
 * answered within Discord's 3 seconds, at once or deferred.
 *
 * Each Discord user has a few actions per 10 seconds, and more
 * autocompletions; nothing of an interaction's token is ever logged.
 */

const MAX_BODY_BYTES = 1024 * 1024;

const LIMITS = {
  action: { count: 8, windowMs: 10 * 1000 },
  autocomplete: { count: 40, windowMs: 10 * 1000 },
};
const recent = new Map<string, number[]>();

/** Whether the user may act now: a sliding window per user and kind */
function withinLimit(discordUserId: string | undefined, kind: keyof typeof LIMITS, now = Date.now()): boolean {
  if (!discordUserId) return true;
  const { count, windowMs } = LIMITS[kind];
  const key = `${kind}:${discordUserId}`;
  const times = (recent.get(key) || []).filter(time => now - time < windowMs);
  if (times.length >= count) {
    recent.set(key, times);
    return false;
  }
  times.push(now);
  recent.set(key, times);
  return true;
}

// The windows of users gone quiet are forgotten
if (Meteor.isServer) {
  Meteor.setInterval(() => {
    const now = Date.now();
    for (const [key, times] of recent) {
      if (times.every(time => now - time > 60 * 1000)) recent.delete(key);
    }
  }, 60 * 1000);
}

/** Forgets every user's window, for a test */
export function resetInteractionLimits() {
  recent.clear();
}

const INTERACTION = { ping: 1, command: 2, component: 3, autocomplete: 4 };
const BUTTON = 2;
// /action's menus, selects and buttons alike (interactionActions.ts)
const ACTION_MENU = /^dc:act:/;

/** What an interaction gets, at once, and what is left to do once that has left */
export async function handleInteraction(interaction: Interaction): Promise<Handled> {
  if (interaction.type === INTERACTION.ping) return { response: { type: RESPONSE.pong } };
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;
  const language = interactionLanguage(interaction.locale);
  if (interaction.type === INTERACTION.autocomplete) {
    if (!withinLimit(discordUserId, 'autocomplete')) return { response: { type: RESPONSE.autocomplete, data: { choices: [] } } };
    if (interaction.data?.name === 'action') return handleActionAutocomplete(interaction);
    return handleAutocomplete(interaction);
  }
  if (interaction.type === INTERACTION.command || interaction.type === INTERACTION.component) {
    if (!withinLimit(discordUserId, 'action')) return { response: { type: RESPONSE.message, data: textMessage(say(language, 'slowDown')) } };
    if (interaction.type === INTERACTION.command) {
      return interaction.data?.name === 'action' ? handleActionCommand(interaction) : handleCommand(interaction);
    }
    if (ACTION_MENU.test(interaction.data?.custom_id || '')) return handleActionComponent(interaction);
    if ((interaction.data as { component_type?: number } | undefined)?.component_type === BUTTON) return handleButton(interaction);
  }
  return { response: { type: RESPONSE.message, data: textMessage(say(language, 'unknownCommand')) } };
}

function readBody(req: any): Promise<Buffer | undefined> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(undefined);
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(undefined));
  });
}

function answer(res: any, status: number, body?: unknown) {
  res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

// What the browser learns: whether to offer installing the application, and its id for the link
const publicSettings = Meteor.settings.public as Record<string, unknown>;
publicSettings.discordInteractions = !!interactionsPublicKey();
const clientId = (Meteor.settings as { discord?: { clientId?: unknown } }).discord?.clientId;
if (publicSettings.discordInteractions && typeof clientId === 'string' && /^\d{1,32}$/.test(clientId)) {
  publicSettings.discordApplicationId = clientId;
}

// An answer slower than this is logged (Discord waits 3 s)
const SLOW_ANSWER_MS = 1500;

/** "autocomplete /action": what an interaction is, for the logs; never its token, options or ids */
function interactionKind(interaction: Interaction) {
  const type = Object.entries(INTERACTION).find(([, value]) => value === interaction.type)?.[0] ?? 'unknown';
  const name = interaction.data?.name;
  return typeof name === 'string' && /^[\w-]{1,32}$/.test(name) ? `${type} /${name}` : type;
}

WebApp.rawHandlers.use('/discord/interactions', async (req: any, res: any) => {
  const received = Date.now();
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' });
    res.end();
    return;
  }
  if (!interactionsPublicKey()) {
    answer(res, 404);
    return;
  }
  const body = await readBody(req);
  if (!body) {
    answer(res, 413);
    return;
  }
  const check = checkSignature({ signature: req.headers['x-signature-ed25519'], timestamp: req.headers['x-signature-timestamp'], body });
  if (check !== 'ok') {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('invalid request signature');
    return;
  }
  let interaction: Interaction;
  try {
    interaction = JSON.parse(body.toString('utf8'));
  } catch {
    answer(res, 400);
    return;
  }
  let handled: Handled;
  const started = Date.now();
  try {
    handled = await handleInteraction(interaction);
  } catch (e) {
    console.warn(`Discord: an interaction failed (${interactionKind(interaction)}): ${(e as Error)?.message || e}`);
    // An autocomplete takes choices alone: a message would be refused, as a failure to load them
    handled = interaction.type === INTERACTION.autocomplete
      ? { response: { type: RESPONSE.autocomplete, data: { choices: [] } } }
      : { response: { type: RESPONSE.message, data: textMessage(say(interactionLanguage(interaction.locale), 'failed', { error: '–' })) } };
  }
  // Discord waits 3 s for the answer: one that came close says how long it
  // took, and how much of it was the work, to find what slowed it
  const now = Date.now();
  if (now - received > SLOW_ANSWER_MS) {
    console.warn(`Discord: slow answer (${interactionKind(interaction)}): ${now - received} ms, ${now - started} ms of work`);
  }
  answer(res, 200, handled.response);
  handled.after?.().catch(e => console.warn(`Discord: an interaction's follow-up failed: ${(e as Error)?.message || e}`));
});

// For the tests: who runs an interaction
export { interactionContext };
