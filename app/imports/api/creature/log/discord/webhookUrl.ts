/*
 * A Discord webhook's URL, https://discord.com/api/webhooks/<id>/<token>: the
 * server only ever takes its id and token from it, and the interface its id,
 * to tell whether a session was opened on the webhook set now. Shared by the
 * client and the server.
 */

export type Webhook = { id: string, token: string };

/** A webhook's id and token, from its URL; undefined when it is not one */
export function parseWebhookURL(webhookURL?: string | null): Webhook | undefined {
  if (!webhookURL || typeof webhookURL !== 'string') return undefined;
  const parts = webhookURL.split(/[?#]/)[0].split('/').filter(Boolean);
  const token = parts.pop();
  const id = parts.pop();
  if (!/^\d+$/.test(id || '') || !/^[\w-]+$/.test(token || '')) return undefined;
  return { id: id as string, token: token as string };
}

/**
 * Whether a URL typed in is a Discord webhook's, the strict way: on one of
 * Discord's hosts, over https, with a numeric id. The party board's setting
 * asks for it; the server reads only the id and token in any case.
 */
export function isDiscordWebhookURL(webhookURL?: string | null): boolean {
  let url: URL;
  try {
    url = new URL(String(webhookURL || '').trim());
  } catch {
    return false;
  }
  return url.protocol === 'https:'
    && /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/.test(url.hostname)
    && /^\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname);
}
