/**
 * Posts a message to a Discord webhook with the platform's fetch.
 *
 * This used discord.js, whose only use here was a WebhookClient. Version 12
 * also drags in voice and gateway support (prism-media, ws and their optional
 * native addons), none of which is installed or used, and every start of the
 * dev server warned about them. A webhook is a single HTTP request.
 *
 * Only the id and token are taken from the stored URL: the request always goes
 * to Discord, so a creature's webhook setting cannot point the server at an
 * arbitrary host.
 */
const DISCORD_API = 'https://discord.com/api/webhooks';

function parseWebhookURL(webhookURL) {
  // https://discord.com/api/webhooks/<id>/<token>
  const urlArray = String(webhookURL).split('?')[0].split('/').filter(Boolean);
  const token = urlArray.pop();
  const id = urlArray.pop();
  if (!/^\d+$/.test(id || '') || !/^[\w-]+$/.test(token || '')) return;
  return { id, token };
}

// discord.js normalised embeds to the API's shape; log content carries extra
// keys (context, silenced) that the API would reject
function toApiEmbed(embed) {
  return {
    ...embed,
    fields: embed.fields?.map(({ name, value, inline }) => ({ name, value, inline: !!inline })),
  };
}

export default async function sendWebhook({ webhookURL, data = {} }) {
  const hook = parseWebhookURL(webhookURL);
  if (!hook) return;
  const body = {
    content: data.content,
    username: data.username,
    avatar_url: data.avatarURL,
    embeds: data.embeds?.map(toApiEmbed),
    // Prevent the mention exploit: never ping anyone
    allowed_mentions: { parse: [] },
  };
  try {
    const response = await fetch(`${DISCORD_API}/${hook.id}/${hook.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(`Discord webhook failed: ${response.status} ${await response.text()}`);
    }
  } catch (e) {
    // Swallow the error, we don't really care
    console.error(e);
  }
}

export function sendWebhookAsCreature({ creature, data = {} }) {
  if (!creature || !creature.settings || !creature.settings.discordWebhook) return;
  data.username = creature.name;
  data.avatarURL = creature.avatarPicture;
  // Not awaited: a log should never wait on Discord
  sendWebhook({
    webhookURL: creature.settings.discordWebhook,
    data,
  });
}
