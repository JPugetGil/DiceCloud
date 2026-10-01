<template>
  <v-btn
    v-if="context.editPermission"
    class="check-button"
    :class="`check-button--${shape}`"
    variant="tonal"
    :color="inheritColor ? undefined : 'primary'"
    :rounded="shape === 'pill' ? 'pill' : 'lg'"
    :height="shape === 'tile' ? height : 32"
    :min-width="shape === 'tile' ? minWidth : 72"
    :loading="loading"
    :data-id="`check-btn-${model._id}`"
    :aria-label="title"
    @click.stop="check"
  >
    <v-icon
      class="check-button__die"
      :size="shape === 'tile' ? 16 : 18"
      :start="shape === 'pill'"
      icon="mdi-dice-d20-outline"
    />
    <slot />
    <v-tooltip
      activator="parent"
      location="top"
      :text="title"
    />
  </v-btn>
  <div
    v-else
    class="check-button check-button--readonly d-flex align-center justify-center"
    :class="`check-button--${shape}`"
    :style="shape === 'tile'
      ? { height: `${height}px`, minWidth: `${minWidth}px` }
      : { height: '32px', minWidth: '72px' }"
  >
    <slot />
  </div>
</template>

<script setup>
/**
 * Rolls a check for an ability, a skill or a save: a tonal button marked with
 * a d20, so that the roll is told apart from the row around it, which opens
 * the property. Without edit permission it shows its content, unstyled.
 */
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import doAction from '/imports/ui/creature/actions/doAction';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  // An ability score rolls as the check's ability, anything else as its skill
  ability: Boolean,
  // `tile`: a block holding a large value; `pill`: a compact modifier
  shape: {
    type: String,
    default: 'pill',
    validator: value => ['tile', 'pill'].includes(value),
  },
  // On a card of the user's colour, take the card's text colour, not primary
  inheritColor: Boolean,
  height: {
    type: [Number, String],
    default: 72,
  },
  minWidth: {
    type: [Number, String],
    default: 72,
  },
});

const { t } = useI18n();
const context = inject('context', {});
const loading = ref(false);

const title = computed(() => t('stats.roll', { name: props.model.name || '' }));

async function check() {
  loading.value = true;
  await doAction({
    creatureId: props.model.root.id,
    elementId: `check-btn-${props.model._id}`,
    task: {
      subtaskFn: 'check',
      targetIds: [props.model.root.id],
      advantage: props.model.advantage,
      skillVariableName: props.ability ? undefined : props.model.variableName,
      abilityVariableName: props.ability ? props.model.variableName : props.model.ability,
      dc: null,
    },
  }).catch(error => {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  }).finally(() => {
    loading.value = false;
  });
}
</script>

<style scoped>
/* The tile's die sits in its corner, clear of the value */
.check-button--tile .check-button__die {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0.7;
}
</style>
