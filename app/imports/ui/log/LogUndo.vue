<template>
  <!--
    A received entry ("Goblin 1 → you"): who undid it, or, for those who may
    edit the creature while the encounter lasts, "Undo" (phase 2.4)
  -->
  <div
    v-if="undoneBy || offered"
    class="d-flex align-center flex-wrap ga-2 px-2 pb-2"
    data-id="log-undo"
  >
    <div
      v-if="undoneBy"
      class="text-body-small text-medium-emphasis d-flex align-center ga-1"
      data-id="log-undone"
    >
      <v-icon
        size="small"
        icon="mdi-undo-variant"
      />
      {{ $t('log.undo.done', { name: undoneBy }) }}
    </div>
    <template v-else>
      <v-menu v-if="reversible">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            size="small"
            variant="tonal"
            prepend-icon="mdi-undo-variant"
            :loading="busy"
            :aria-label="$t('log.undo.label', { name: heading })"
            data-id="log-undo-button"
          >
            {{ $t('log.undo.button') }}
          </v-btn>
        </template>
        <v-list>
          <v-list-item
            prepend-icon="mdi-undo-variant"
            :title="$t('log.undo.confirm')"
            :subtitle="$t('log.undo.confirmHint')"
            data-id="log-undo-confirm"
            @click="undo"
          />
        </v-list>
      </v-menu>
      <div
        v-if="irreversible.length"
        class="text-body-small text-medium-emphasis"
        data-id="log-undo-irreversible"
      >
        {{ $t('log.undo.irreversible', { names: irreversible.join(', ') }) }}
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { revertReceived } from '/imports/api/creature/log/methods/revertReceived';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';
import { translateLine } from '/imports/ui/log/translateLog';

const { t } = useI18n();

const props = defineProps({
  // The log entry
  model: {
    type: Object,
    required: true,
  },
  // Whether the reader may edit the creature: its owner, its game master
  canEdit: Boolean,
  // The encounters under way of the creature's parties, `folderId:id`
  // (characterParties): an entry is undone while its own lasts
  encounters: {
    type: Array,
    default: () => [],
  },
});

const received = computed(() => props.model.received);

const undoneBy = computed(() => {
  const undone = received.value?.undone;
  if (!undone) return undefined;
  return undone.name || t('logs.someone');
});

// The server says so too: the same rule (revertReceived, encounters.ts)
const offered = computed(() => {
  const entry = received.value;
  if (!entry || entry.undone || !props.canEdit) return false;
  if (!entry.reversible && !entry.irreversible?.length) return false;
  const encounter = entry.encounter;
  return !!encounter && props.encounters.includes(`${encounter.folderId}:${encounter.id}`);
});

const reversible = computed(() => !!received.value?.reversible);
const irreversible = computed(() => received.value?.irreversible || []);

// The entry's heading, in the reader's language, which the button names
const heading = computed(() => {
  const first = props.model.content?.[0];
  return first ? translateLine(first).name : '';
});

const busy = ref(false);

async function undo() {
  if (busy.value) return;
  busy.value = true;
  try {
    await revertReceived.callAsync({ logId: props.model._id });
    snackbar({ text: t('log.undo.success') });
  } catch (error) {
    snackbar({ text: boardErrorText(error, t) });
  } finally {
    busy.value = false;
  }
}
</script>
