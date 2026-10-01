<template>
  <div
    style="height: 100%; overflow: hidden;"
    class="character-log d-flex flex-1-1 flex-column justify-end"
  >
    <v-slide-y-reverse-transition
      group
      tag="div"
      hide-on-leave
      class="bg-raised flex-1-1 d-flex flex-column-reverse align-end pa-3"
      style="overflow: auto;"
    >
      <log-entry
        v-for="log in logs"
        :key="log._id"
        :model="log"
        :fresh="freshIds.has(log._id)"
      />
    </v-slide-y-reverse-transition>
    <v-card>
      <v-text-field
        v-model="input"
        class="mx-2 mb-2"
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

async function submit() {
  if (!input.value) return;
  if (submitLoading.value) return;
  const log = {
    roll: input.value,
  };
  if (props.creatureId) log.creatureId = props.creatureId;
  submitLoading.value = true;
  try {
    await logRoll.callAsync(log);
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
