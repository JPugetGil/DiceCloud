<template>
  <div
    class="condition-chips d-flex flex-wrap ga-2 px-4 pt-1 pb-3"
    data-id="condition-chips"
  >
    <v-tooltip
      v-for="condition in conditions"
      :key="condition._id"
      location="top"
      open-delay="600"
      max-width="360"
      :disabled="!condition.description"
    >
      <template #activator="{ props: tooltip }">
        <v-chip
          v-bind="tooltip"
          size="small"
          :variant="active[condition._id] ? 'flat' : 'outlined'"
          :color="active[condition._id] ? 'primary' : undefined"
          :prepend-icon="active[condition._id] ? 'mdi-check' : undefined"
          :aria-pressed="!!active[condition._id]"
          :disabled="pending.has(condition._id)"
          :data-id="`condition-${condition._id}`"
          @click="toggle(condition)"
        >
          {{ condition.name }}
        </v-chip>
      </template>
      <markdown-text
        class="condition-description"
        :markdown="condition.description"
      />
    </v-tooltip>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import softRemoveProperty from '/imports/api/creature/creatureProperties/methods/softRemoveProperty';
import { isCondition } from '/imports/api/creature/creatureProperties/conditions';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import MarkdownText from '/imports/ui/components/MarkdownText.vue';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  // listConditions' result
  conditions: {
    type: Array,
    required: true,
  },
  // The character's active buffs
  buffs: {
    type: Array,
    default: () => [],
  },
});

// The buffs on the character that are each condition
const active = computed(() => Object.fromEntries(props.conditions.map(condition => [
  condition._id, props.buffs.filter(buff => isCondition(buff, condition)),
]).filter(([, buffs]) => buffs.length)));

const pending = reactive(new Set());

async function toggle(condition) {
  if (pending.has(condition._id)) return;
  pending.add(condition._id);
  try {
    if (active.value[condition._id]) {
      for (const buff of active.value[condition._id]) {
        await softRemoveProperty.callAsync({ _id: buff._id });
      }
    } else {
      await insertPropertyFromLibraryNode.callAsync({
        nodeIds: [condition._id],
        parentRef: { id: props.creatureId, collection: 'creatures' },
      });
    }
  } catch (error) {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  } finally {
    pending.delete(condition._id);
  }
}
</script>

<style scoped>
.condition-description > :deep(:last-child) {
  margin-bottom: 0;
}
</style>
