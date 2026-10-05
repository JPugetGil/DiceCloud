<template>
  <v-list-item
    :key="model._id"
    :data-id="`spell-slot-list-tile-${model._id}`"
    :disabled="disabled"
    class="spell-slot-list-tile"
    v-bind="$attrs"
    v-on="hasClickListener ? {click} : {}"
  >
    <v-list-item-title v-if="Number.isFinite(model.total)">
      <div
        v-if="model.total <= 0 || model.total > 5 || model.value > model.total || model.value < 0"
        class="d-flex flex-1-1 value"
        style="align-items: baseline;"
      >
        <div
          style="font-weight: 500; font-size: 24px"
          class="current-value"
        >
          {{ model.value }}
        </div>
        <div
          v-if="model.total"
          class="ml-2 max-value text-medium-emphasis"
        >
          /{{ model.total }}
        </div>
      </div>
      <div
        v-else-if="canEdit"
        class="d-flex flex-1-1 align-center slot-bubbles"
      >
        <smart-btn
          v-for="i in model.total"
          :key="i"
          variant="text"
          icon
          single-click
          @click="ack => damageProperty({
            type: 'increment',
            value: i <= model.value ? 1 : -1,
            ack
          })"
        >
          <v-icon>
            {{
              i > model.value ?
                'mdi-radiobox-blank' :
                'mdi-radiobox-marked'
            }}
          </v-icon>
        </smart-btn>
      </div>
      <div
        v-else
        class="d-flex flex-1-1 align-center slot-bubbles view-only"
        :class="{'disabled-icon': disabled}"
      >
        <v-icon
          v-for="i in model.total"
          :key="i"
          class="ma-1"
        >
          {{
            i > model.value ?
              'mdi-radiobox-blank' :
              'mdi-radiobox-marked'
          }}
        </v-icon>
      </div>
    </v-list-item-title>
    <v-list-item-title v-else>
      <code>
        {{ model.total }}
      </code>
    </v-list-item-title>
    <v-list-item-subtitle>
      {{ model.name }}
    </v-list-item-subtitle>
  </v-list-item>
</template>

<script setup>
import { computed, inject } from 'vue';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import doAction from '/imports/ui/creature/actions/doAction';
import getPropertyTitle from '/imports/ui/properties/shared/getPropertyTitle';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  viewOnly: Boolean,
  disabled: Boolean,
  // The parent's @click listener, declared so that the tile knows whether it is
  // clickable: Vue keeps a declared event's listener out of $attrs.
  // `emit('click')` still calls it.
  onClick: {
    type: Function,
    default: undefined,
  },
});

const emit = defineEmits(['click']);

const context = inject('context', {});

const hasClickListener = computed(() => {
  return !!props.onClick;
});

const canEdit = computed(() => {
  return context.editPermission && !props.viewOnly;
});

function click(e) {
  emit('click', e);
}

async function damageProperty({ type, value, ack }) {
  const model = props.model;
  await doAction({
    creatureId: model.root.id,
    elementId: `spell-slot-list-tile-${model._id}`,
    task: {
      subtaskFn: 'damageProp',
      targetIds: [model.root.id],
      params: {
        title: getPropertyTitle(model),
        operation: type,
        value,
        targetProp: model,
      },
    },
  }).then(() => {
    ack?.();
  }).catch((error) => {
    if (ack) {
      ack(error);
    } else {
      snackbar({ text: error.reason || error.message || error.toString() });
      console.error(error);
    }
  });
}
</script>

<style lang="css" scoped>
.spell-slot-list-tile {
  background: inherit;
}

.v-list-item-action {
  width: 112px;
  flex-shrink: 0;
}

.disabled-icon {
  opacity: 0.3;
}

</style>
