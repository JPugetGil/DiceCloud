<template>
  <template v-if="discordOAuth || account">
    <v-list-subheader class="mt-2">
      {{ $t('discord.account.title') }}
    </v-list-subheader>
    <v-list-item data-id="discord-account">
      <p
        v-if="account"
        class="text-body-medium d-flex align-center ga-2 my-0"
        data-id="discord-account-linked"
      >
        <v-icon size="small">
          $discord
        </v-icon>
        {{ $t('discord.account.linked', { name: account.username || account.id }) }}
      </p>
      <p
        v-else
        class="text-body-medium my-0"
      >
        {{ $t('discord.account.notLinked') }}
      </p>
      <div class="d-flex flex-wrap ga-2 mt-2">
        <v-btn
          v-if="!account"
          color="primary"
          variant="tonal"
          prepend-icon="$discord"
          :loading="busy === 'link'"
          :disabled="!!busy"
          data-id="discord-link"
          @click="link"
        >
          {{ $t('discord.account.link') }}
        </v-btn>
        <v-btn
          v-else
          variant="text"
          prepend-icon="mdi-account-off-outline"
          :loading="busy === 'unlink'"
          :disabled="!!busy"
          data-id="discord-unlink"
          @click="unlink"
        >
          {{ $t('discord.account.unlink') }}
        </v-btn>
      </div>
      <!-- DiceCloud holds no token to revoke: Discord's own list does it -->
      <p
        v-if="account"
        class="text-body-small text-medium-emphasis mt-2 mb-0"
        data-id="discord-unlink-hint"
      >
        {{ $t('discord.account.unlinkHint') }}
      </p>
    </v-list-item>
    <v-list-item v-if="account">
      <v-switch
        :model-value="!preferences.discordMentionOff"
        :label="$t('discord.account.mention')"
        :hint="$t('discord.account.mentionHint')"
        persistent-hint
        color="primary"
        density="compact"
        :loading="busy === 'mention'"
        data-id="discord-mention"
        @update:model-value="setMention"
      />
    </v-list-item>
  </template>
</template>

<script setup>
import { setPreference } from '/imports/api/users/Users';
import { ref, computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import { Meteor } from 'meteor/meteor';
import { discordLinkUrl, discordUnlink } from '/imports/api/discord/methods/discordOAuthMethods';
import { bindToThisBrowser } from '/imports/ui/discord/discordNonce';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

/**
 * The account's Discord settings (D5): link the Discord account, which
 * DiceCloud knows by its id and name alone, to be mentioned on one's turns
 * and to sign in with Discord; unlink it; turn the mentions off. Shown when
 * this server has a Discord application, or an account is linked already.
 * Unlinking forgets the link; the authorization stays on Discord, which
 * DiceCloud holds no token to revoke: the user removes it in Discord's
 * Authorized Apps, as the hint says.
 */
const { t } = useI18n();

const discordOAuth = !!Meteor.settings.public?.discordOAuth;
const user = autorun(() => Meteor.user({ fields: { discordAccount: 1, preferences: 1 } })).result;
const account = computed(() => user.value?.discordAccount);
const preferences = computed(() => user.value?.preferences || {});

// 'link', 'unlink' or 'mention' while its method runs
const busy = ref(/** @type {'link' | 'unlink' | 'mention' | undefined} */ (undefined));

async function run(name, call) {
  busy.value = name;
  try {
    await call();
  } catch (error) {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
  } finally {
    busy.value = undefined;
  }
}

function link() {
  run('link', async () => {
    // Discord's page, which comes back here with the result, to this browser alone
    const url = await discordLinkUrl.callAsync({ returnTo: '/account', nonceHash: await bindToThisBrowser('link') });
    if (url) {
      busy.value = 'link';
      window.location.assign(url);
    }
  });
}

function unlink() {
  run('unlink', async () => {
    await discordUnlink.callAsync();
    snackbar({ text: t('discord.account.unlinked') });
  });
}

function setMention(value) {
  run('mention', () => setPreference.callAsync({ preference: 'discordMentionOff', value: !value }));
}
</script>
