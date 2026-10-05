<template>
  <div
    class="condition-chips d-flex flex-wrap ga-2"
    data-id="condition-chips"
  >
    <template v-if="layout !== 'add'">
      <condition-chip
        v-for="condition in shown"
        :key="condition._id"
        :condition="condition"
        :on="isOn(condition)"
        :pending="pending.has(condition._id)"
        @toggle="toggle(condition)"
      />
    </template>
    <!-- Below md, and on the party board: the conditions it has, and the others in a menu (UX10) -->
    <v-menu
      v-if="layout !== 'all'"
      v-model="menu"
      :close-on-content-click="false"
      location="bottom start"
      max-width="400"
    >
      <template #activator="{ props: menuProps }">
        <v-chip
          v-bind="menuProps"
          role="button"
          size="small"
          variant="outlined"
          prepend-icon="mdi-plus"
          data-id="condition-add"
        >
          {{ $t('conditions.add') }}
        </v-chip>
      </template>
      <v-card data-id="condition-palette">
        <v-card-title class="text-title-medium">
          {{ $t('conditions.title') }}
        </v-card-title>
        <v-card-text class="d-flex flex-wrap ga-2">
          <v-progress-circular
            v-if="palette === undefined"
            indeterminate
            size="24"
            :aria-label="$t('conditions.loading')"
          />
          <template v-else>
            <condition-chip
              v-for="condition in palette"
              :key="condition._id"
              :condition="condition"
              :on="isOn(condition)"
              :pending="pending.has(condition._id)"
              @toggle="toggle(condition)"
            />
            <span
              v-if="!palette.length"
              class="text-body-medium text-medium-emphasis"
            >
              {{ $t('conditions.none') }}
            </span>
          </template>
        </v-card-text>
      </v-card>
    </v-menu>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import softRemoveProperty from '/imports/api/creature/creatureProperties/methods/softRemoveProperty';
import listConditions from '/imports/api/creature/creatureProperties/methods/listConditions';
import { isCondition } from '/imports/api/creature/creatureProperties/conditions';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import ConditionChip from '/imports/ui/properties/components/buffs/ConditionChip.vue';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  // listConditions' result; without it, the menu asks for them when it opens
  conditions: {
    type: Array,
    default: undefined,
  },
  // The character's active buffs
  buffs: {
    type: Array,
    default: () => [],
  },
  // 'all' the conditions as chips; 'active' those the character has, and the
  // others in a menu; 'add' only the menu
  layout: {
    type: String,
    default: 'all',
  },
});

const menu = ref(false);

// The conditions, given or fetched when the menu first opens
const fetched = ref(undefined);
watch(() => props.creatureId, () => { fetched.value = undefined; });
watch(menu, async open => {
  if (!open || props.conditions || fetched.value) return;
  const creatureId = props.creatureId;
  try {
    const result = await listConditions.callAsync({ creatureId });
    if (creatureId === props.creatureId) fetched.value = result || [];
  } catch (error) {
    fetched.value = [];
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  }
});
const palette = computed(() => props.conditions ?? fetched.value);

// The buffs on the character that are each condition
const active = computed(() => Object.fromEntries((palette.value || []).map(condition => [
  condition._id, props.buffs.filter(buff => isCondition(buff, condition)),
]).filter(([, buffs]) => buffs.length)));

// The conditions being given or taken away: whether each will be on
const pending = reactive(new Map());
const isOn = condition => pending.has(condition._id)
  ? pending.get(condition._id)
  : !!active.value[condition._id];

const shown = computed(() => (palette.value || []).filter(condition =>
  props.layout === 'all' || isOn(condition)
));

async function toggle(condition) {
  if (pending.has(condition._id)) return;
  const removing = !!active.value[condition._id];
  pending.set(condition._id, !removing);
  try {
    if (removing) {
      for (const buff of active.value[condition._id]) {
        await softRemoveProperty.callAsync({ _id: buff._id });
      }
    } else {
      await insertPropertyFromLibraryNode.callAsync({
        nodeIds: [condition._id],
        parentRef: { id: props.creatureId, collection: 'creatures' },
      });
    }
    // The method answers before its changes reach the client: the chip
    // waits for them, or it would turn back for a moment
    await changed(condition._id, !removing);
  } catch (error) {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  } finally {
    pending.delete(condition._id);
  }
}

function changed(conditionId, on, timeout = 3000) {
  return new Promise(resolve => {
    if (!!active.value[conditionId] === on) return resolve();
    let stop;
    const timer = setTimeout(done, timeout);
    stop = watch(() => !!active.value[conditionId] === on, isDone => { if (isDone) done(); });
    function done() {
      clearTimeout(timer);
      stop?.();
      resolve();
    }
  });
}
</script>
