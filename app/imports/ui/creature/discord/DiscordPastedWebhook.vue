<template>
  <div
    class="discord-pasted-webhook"
    :data-id="`${dataId}-pasted`"
  >
    <!-- Set: the server keeps the URL; the browser only knows the webhook's id -->
    <template v-if="webhookId && !replacing">
      <p
        class="text-body-medium d-flex align-center ga-2 my-0"
        :data-id="`${dataId}-masked`"
      >
        <v-icon
          size="small"
          color="success"
        >
          mdi-webhook
        </v-icon>
        {{ $t('discord.pasted.masked', { end: webhookId.slice(-4) }) }}
      </p>
      <p class="text-body-small text-medium-emphasis mt-1 mb-0">
        {{ $t('discord.pasted.hidden') }}
      </p>
      <div
        v-if="!disabled"
        class="d-flex flex-wrap ga-2 mt-2"
      >
        <v-btn
          variant="tonal"
          prepend-icon="mdi-swap-horizontal"
          :disabled="!!busy"
          :data-id="`${dataId}-replace`"
          @click="replacing = true"
        >
          {{ $t('discord.pasted.replace') }}
        </v-btn>
        <v-btn
          variant="text"
          prepend-icon="mdi-link-variant-off"
          :loading="busy === 'remove'"
          :disabled="!!busy"
          :data-id="`${dataId}-remove`"
          @click="emit('remove')"
        >
          {{ $t('discord.remove') }}
        </v-btn>
      </div>
    </template>
    <!-- To set, or to replace: an empty field, never the URL set before -->
    <form
      v-else-if="!disabled"
      class="d-flex flex-wrap align-start ga-2"
      @submit.prevent="save"
    >
      <v-text-field
        v-model="url"
        :label="label"
        :hint="hint"
        persistent-hint
        placeholder="https://discord.com/api/webhooks/<id>/<token>"
        variant="outlined"
        density="compact"
        autocomplete="off"
        spellcheck="false"
        class="flex-1-1"
        style="min-width: 200px;"
        :data-id="`${dataId}-webhook`"
      />
      <v-btn
        type="submit"
        variant="tonal"
        :disabled="!url.trim()"
        :loading="busy === 'save'"
        :data-id="`${dataId}-save`"
      >
        {{ $t('discord.save') }}
      </v-btn>
      <v-btn
        v-if="replacing"
        variant="text"
        :disabled="!!busy"
        :data-id="`${dataId}-cancel`"
        @click="cancel"
      >
        {{ $t('discord.pasted.cancel') }}
      </v-btn>
    </form>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

/**
 * A webhook pasted on a character or a party board. Its URL is a secret the
 * server alone keeps, sealed (pastedWebhooks.ts): once set, the browser shows
 * "Webhook …1234", the end of the webhook's id, with "Replace" and "Remove".
 * The parent calls the methods: it knows whose webhook it is; it clears
 * `busy` when they return, and calls the `done` that `save` comes with once
 * saved.
 */
const props = defineProps({
  // The id of the webhook set, if any
  webhookId: {
    type: String,
    default: undefined,
  },
  label: {
    type: String,
    required: true,
  },
  hint: {
    type: String,
    default: undefined,
  },
  // 'save' or 'remove' while its method runs
  busy: {
    type: String,
    default: undefined,
  },
  // Who cannot change it sees whether one is set, nothing more
  disabled: Boolean,
  // The prefix of the data-id attributes: <dataId>-webhook, -save, -remove...
  dataId: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['save', 'remove']);

const url = ref('');
const replacing = ref(false);

// Saved, or replaced: back to the masked webhook
watch(() => props.webhookId, () => {
  url.value = '';
  replacing.value = false;
});

function cancel() {
  url.value = '';
  replacing.value = false;
}

// The parent calls `done` once saved. A first webhook: the watch on webhookId
// empties the field when the masked webhook replaces the form, in the same
// render. Emptied here before that, the field animated its label one frame
// later, often once it had left the page ("scale(NaN)" in the console). A
// replaced one: the same webhook again changes no id, so `done` goes back to
// the masked webhook, the form leaving as the field empties
function save() {
  const value = url.value.trim();
  if (value) emit('save', value, () => { if (props.webhookId) cancel(); });
}
</script>
