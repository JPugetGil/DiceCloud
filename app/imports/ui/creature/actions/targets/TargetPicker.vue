<template>
  <div
    class="target-picker"
    data-id="target-picker"
  >
    <!-- Several targets: shortcuts, and who is in the area is ticked -->
    <template v-if="!single">
      <div
        class="d-flex flex-wrap ga-2 mb-2"
        role="group"
        :aria-label="$t('targetPicker.shortcuts')"
      >
        <v-chip
          v-for="shortcut in shortcuts"
          :key="shortcut.name"
          size="small"
          variant="tonal"
          :prepend-icon="shortcut.icon"
          :disabled="!shortcut.ids.length && shortcut.name !== 'none'"
          :data-id="`target-shortcut-${shortcut.name}`"
          @click="model = shortcut.ids"
        >
          {{ shortcut.title }}
        </v-chip>
      </div>
      <p class="text-body-small text-medium-emphasis mt-0 mb-1">
        {{ $t('targetPicker.areaHint') }}
      </p>
    </template>

    <v-radio-group
      v-if="single"
      v-model="singleTarget"
      hide-details
      density="compact"
      :aria-label="$t('targetPicker.title')"
    >
      <v-radio
        value=""
        data-id="target-option-none"
      >
        <template #label>
          <div>
            <div>{{ $t('targetPicker.noTarget') }}</div>
            <div class="text-body-small text-medium-emphasis">
              {{ $t('targetPicker.noTargetHint') }}
            </div>
          </div>
        </template>
      </v-radio>
      <template
        v-for="group in groups"
        :key="group.kind"
      >
        <div class="target-picker__group text-label-large text-medium-emphasis">
          {{ group.title }}
        </div>
        <v-radio
          v-for="creature in group.creatures"
          :key="creature._id"
          :value="creature._id"
          :data-id="`target-option-${creature._id}`"
        >
          <template #label>
            <target-picker-label
              :creature="creature"
              :is-actor="creature._id === actorId"
            />
          </template>
        </v-radio>
      </template>
    </v-radio-group>

    <template v-else>
      <template
        v-for="group in groups"
        :key="group.kind"
      >
        <div class="target-picker__group text-label-large text-medium-emphasis">
          {{ group.title }}
        </div>
        <v-checkbox
          v-for="creature in group.creatures"
          :key="creature._id"
          :model-value="model.includes(creature._id)"
          hide-details
          density="compact"
          :data-id="`target-option-${creature._id}`"
          @update:model-value="checked => toggle(creature._id, checked)"
        >
          <template #label>
            <target-picker-label
              :creature="creature"
              :is-actor="creature._id === actorId"
            />
          </template>
        </v-checkbox>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TargetPickerLabel from '/imports/ui/creature/actions/targets/TargetPickerLabel.vue';

/** @typedef {import('/imports/api/creature/creatureFolders/targetCandidates').CandidateCreature & { kind: 'monster' | 'character' }} Candidate */

/**
 * Who an action targets (phase 2.1 of the monsters): one creature or none
 * for a single target, a radio list; any of them for several, ticked, with
 * shortcuts: all the characters, all the monsters, oneself, none. "No
 * target" announces the action as it always did: its log says what would
 * happen, and nothing is applied. The candidates come from targetCandidates.
 */
const props = defineProps({
  // The creatures it may target, the actor first (targetCandidates)
  candidates: {
    type: /** @type {import('vue').PropType<Candidate[]>} */ (Array),
    default: () => [],
  },
  actorId: {
    type: String,
    default: undefined,
  },
  single: Boolean,
});

// The target ids
const model = defineModel({ type: /** @type {import('vue').PropType<string[]>} */ (Array), default: () => [] });

const { t } = useI18n();

const singleTarget = computed({
  get: () => model.value[0] ?? '',
  set: id => { model.value = id ? [id] : []; },
});

function toggle(id, checked) {
  const others = model.value.filter(other => other !== id);
  model.value = checked ? [...others, id] : others;
}

const ofKind = kind => props.candidates.filter(creature => creature.kind === kind);

// The characters, then the monsters; the actor among its own
const groups = computed(() => [
  { kind: 'character', title: t('targetPicker.characters'), creatures: ofKind('character') },
  { kind: 'monster', title: t('targetPicker.monsters'), creatures: ofKind('monster') },
].filter(group => group.creatures.length));

const shortcuts = computed(() => [
  {
    name: 'characters', icon: 'mdi-account-group', title: t('targetPicker.allCharacters'),
    ids: ofKind('character').map(creature => creature._id),
  },
  {
    name: 'monsters', icon: 'mdi-paw', title: t('targetPicker.allMonsters'),
    ids: ofKind('monster').map(creature => creature._id),
  },
  {
    name: 'me', icon: 'mdi-account', title: t('targetPicker.me'),
    ids: props.actorId && props.candidates.some(creature => creature._id === props.actorId) ? [props.actorId] : [],
  },
  { name: 'none', icon: 'mdi-close', title: t('targetPicker.none'), ids: [] },
]);
</script>

<style scoped>
.target-picker__group {
  margin-top: 12px;
  margin-bottom: 2px;
}
</style>
