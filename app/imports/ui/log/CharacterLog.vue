<template>
  <div
    style="height: 100%; overflow: hidden;"
    class="character-log d-flex flex-1-1 flex-column justify-end"
  >
    <!--
      No transition group: it measured all 100 entries at every change. A new
      entry animates itself (LogEntry)
    -->
    <!-- Focusable, so that the keyboard scrolls it; not role="log": the announcer reads rolls -->
    <div
      class="bg-raised flex-1-1 d-flex flex-column-reverse align-end pa-3"
      style="overflow: auto;"
      tabindex="0"
      role="region"
      :aria-label="$t('log.entries')"
      data-id="character-log-entries"
    >
      <log-entry
        v-for="log in logs"
        :key="log._id"
        :model="log"
        :fresh="freshIds.has(log._id)"
      />
    </div>
    <!-- Never shrinks: a long log scrolls, and squeezed the input instead -->
    <v-card class="flex-shrink-0 pt-2">
      <!-- Free rolls without typing (UX9): a die, with advantage or not -->
      <div
        class="d-flex ga-1 px-2"
        role="group"
        :aria-label="$t('log.quickDice')"
      >
        <v-btn
          v-for="size in QUICK_DICE"
          :key="size"
          size="small"
          variant="tonal"
          min-width="0"
          class="flex-1-1 px-0 text-none"
          :disabled="!editPermission"
          :aria-label="$t('log.rollDie', { die: `d${size}` })"
          :data-id="`quick-roll-d${size}`"
          @click="rollDie(size)"
        >
          d{{ size }}
        </v-btn>
      </div>
      <v-btn-toggle
        v-model="advantage"
        color="accent"
        density="compact"
        variant="outlined"
        divided
        class="d-flex mx-2 mt-2"
        role="group"
        :aria-label="$t('log.advantageToggle')"
        :disabled="!editPermission"
        data-id="log-advantage"
      >
        <v-btn
          :value="-1"
          :aria-pressed="advantage === -1"
          size="small"
          class="flex-1-1 text-none"
          prepend-icon="mdi-chevron-double-down"
        >
          {{ $t('common.disadvantage') }}
        </v-btn>
        <v-btn
          :value="1"
          :aria-pressed="advantage === 1"
          size="small"
          class="flex-1-1 text-none"
          prepend-icon="mdi-chevron-double-up"
        >
          {{ $t('common.advantage') }}
        </v-btn>
      </v-btn-toggle>
      <v-text-field
        v-model="input"
        :aria-label="$t('log.rollInput')"
        :placeholder="$t('log.rollPlaceholder')"
        class="mx-2 mt-2 mb-2"
        persistent-hint
        style="flex-grow: 0"
        append-inner-icon="mdi-send"
        :hint="inputHint"
        :error-messages="inputError"
        :disabled="!editPermission"
        :loading="submitLoading"
        @click:append-inner="submit"
        @keyup.enter="submit"
        @keyup.up="decrementHistory"
        @keyup.down="incrementHistory"
      />
    </v-card>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onBeforeUnmount } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { Tracker } from 'meteor/tracker';

import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import CreatureLogs, { logRoll } from '/imports/api/creature/log/CreatureLogs';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';

import { parse, prettifyParseError } from '/imports/parser/parser';
import resolve from '/imports/parser/resolve';
import toString from '/imports/parser/toString';
import LogEntry from '/imports/ui/log/LogEntry.vue';
import rollWithAdvantage from '/imports/api/creature/log/rollWithAdvantage';
import { useAppStore } from '/imports/ui/stores/app';
import { useI18n } from 'vue-i18n';
import { Meteor } from 'meteor/meteor';

const { t } = useI18n();

const props = defineProps({
  creatureId: {
    type: String,
    default: undefined,
  },
});

// The quick dice, and the advantage toggle, which lasts one roll
const QUICK_DICE = [4, 6, 8, 10, 12, 20];
const advantage = ref(0);

const inputHint = ref(undefined);
const inputError = ref(undefined);
const input = ref(undefined);
const history = ref([]);
const historyIndex = ref(1);
const submitLoading = ref(false);

watch(input, (value) => {
  input.value = value;
  recalculate();
});
watch(advantage, () => recalculate());

watch(() => props.creatureId, () => {
  Tracker.afterFlush(() => recalculate());
});

// Entries written while the log is open roll their dice in: it starts watching
// once the character's sheet has loaded the earlier ones
const appStore = useAppStore();
const freshIds = reactive(new Set());
let logObserver;
watch(() => props.creatureId && appStore.loadedCharacterId === props.creatureId, (loaded) => {
  logObserver?.stop();
  logObserver = undefined;
  freshIds.clear();
  if (!loaded) return;
  let initializing = true;
  logObserver = CreatureLogs.find({ creatureId: props.creatureId }, {
    fields: { _id: 1 },
  }).observeChanges({
    added(id) {
      if (!initializing) freshIds.add(id);
    },
  });
  initializing = false;
}, { immediate: true });
onBeforeUnmount(() => logObserver?.stop());

watch(historyIndex, (i) => {
  if (typeof history.value[i] === 'string') {
    input.value = history.value[i];
  }
});

async function sendRoll(roll) {
  const log = { roll };
  if (props.creatureId) log.creatureId = props.creatureId;
  if (advantage.value) log.advantage = advantage.value;
  await logRoll.callAsync(log);
  advantage.value = 0;
}

async function rollDie(size) {
  inputError.value = undefined;
  try {
    await sendRoll(`1d${size}`);
  } catch (error) {
    inputError.value = error.message || error.toString();
    console.error(error);
  }
}

async function submit() {
  if (!input.value) return;
  if (submitLoading.value) return;
  submitLoading.value = true;
  try {
    await sendRoll(input.value);
    addHistory(input.value);
    input.value = '';
    inputError.value = undefined;
  } catch (error) {
    inputError.value = error.message || error.toString();
    console.error(error);
  } finally {
    submitLoading.value = false;
  }
}

function addHistory(string) {
  // Don't add duplicates back to back in history
  if (string === history.value[history.value.length - 1]) return;
  history.value.push(string);
  if (history.value.length > 50) history.value.shift();
  historyIndex.value = history.value.length;
}

async function recalculate() {
  inputHint.value = undefined;
  inputError.value = undefined;
  if (!input.value) return;
  let result;
  try {
    result = parse(input.value);
  } catch (e){
    if (e?.constructor?.name === 'EndOfInputError'){
      inputError.value = '...';
    } else {
      let error = prettifyParseError(e);
      inputError.value = error;
    }
    return;
  }
  try {
    let {result: compiled} = await resolve('compile', result, variables.value);
    inputHint.value = toString(compiled);
    if (advantage.value && rollWithAdvantage(input.value, advantage.value) !== input.value) {
      inputHint.value = t(advantage.value > 0 ? 'logs.withAdvantage' : 'logs.withDisadvantage', { name: inputHint.value });
    }
    return;
  } catch (e){
    console.warn(e);
    inputError.value = t('log.compilationError');
    return;
  }
}

function incrementHistory() {
  if (historyIndex.value < history.value.length) {
    historyIndex.value += 1;
  }
}

function decrementHistory() {
  if (historyIndex.value > 0) {
    historyIndex.value -= 1;
  }
}

const { result: logs } = autorun(() => {
  const filter = {};
  if (props.creatureId) {
    filter.creatureId = props.creatureId;
  }
  // An entry whose every line is silenced would show as an empty card
  return CreatureLogs.find(filter, {
    sort: {date: -1},
    limit: 100
  }).fetch().filter(log =>
    log.text || !log.content?.length || log.content.some(line => !line.silenced)
  );
});

const { result: creature } = autorun(() => {
  return Creatures.findOne(props.creatureId) || {};
});

const { result: variables } = autorun(() => {
  return CreatureVariables.findOne({_creatureId: props.creatureId}) || {};
});

const { result: editPermission } = autorun(() => {
  return hasEditPermission(creature.value, Meteor.user());
});
</script>
