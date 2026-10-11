import i18n from '/imports/ui/i18n';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

/*
 * Back from Discord (phase B): the server's OAuth2 callback sends the browser
 * to the page it came from with `?discord=<result>`, connected, linked,
 * denied, expired... (api/discord/server/oauthCallback.ts). The result shows
 * in the reader's language, and leaves the address. The sign-in page shows
 * its own: it has a ticket to sign in with.
 */
const RESULTS = ['connected', 'linked', 'denied', 'expired', 'forbidden', 'error', 'full', 'taken', 'unknown'];

export default function showDiscordResult(router) {
  router.afterEach(to => {
    const result = to.query.discord;
    if (!result || to.path === '/sign-in' || !RESULTS.includes(result)) return;
    const query = { ...to.query };
    delete query.discord;
    router.replace({ path: to.path, query, hash: to.hash });
    snackbar({ text: i18n.global.t(`discord.result.${result}`) });
  });
}
