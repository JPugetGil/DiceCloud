<template>
  <!--
    A mark drawn for a proficiency (D5): nothing when there is none, a disc
    for proficiency, half a disc for half the bonus, a ring around a dot for
    double. The empty mark keeps its place, so that the values line up
  -->
  <span
    v-if="value !== undefined"
    class="proficiency-mark"
    :class="kind && `proficiency-mark--${kind}`"
    :style="markColor"
    v-bind="label ? { role: 'img', 'aria-label': label, title: label } : { 'aria-hidden': 'true' }"
  />
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { proficiencyKind } from '/imports/ui/utility/getProficiencyIcon';

const props = defineProps({
  value: {
    type: Number,
    default: undefined,
  },
  // A colour of the property's own, or of the theme; primary when it has none
  color: {
    type: String,
    default: undefined,
  },
});

const { t } = useI18n();

const kind = computed(() => proficiencyKind(props.value));

const LABELS = {
  proficient: 'proficiencyLevels.proficient',
  double: 'proficiencyLevels.double',
  halfUp: 'proficiencyLevels.halfUp',
  halfDown: 'proficiencyLevels.halfDown',
};
const label = computed(() => kind.value && t(LABELS[kind.value]));

const markColor = computed(() => {
  if (!props.color) return undefined;
  const custom = /^(#|rgb|hsl)/.test(props.color);
  return { color: custom ? props.color : `rgb(var(--v-theme-${props.color}))` };
});
</script>

<style scoped>
.proficiency-mark {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  vertical-align: middle;
  color: rgb(var(--v-theme-primary));
}

.proficiency-mark::before,
.proficiency-mark::after {
  content: '';
  position: absolute;
  border-radius: 50%;
}

/* A disc, 12px */
.proficiency-mark--proficient::before {
  inset: 2px;
  background: currentColor;
}

/* Half of it, the other half outlined */
.proficiency-mark--halfUp::before,
.proficiency-mark--halfDown::before {
  inset: 2px;
  border: 1.5px solid currentColor;
  background: linear-gradient(90deg, currentColor 50%, transparent 50%);
}

/* A dot in a ring: two marks where proficiency has one */
.proficiency-mark--double::before {
  inset: 4.5px;
  background: currentColor;
}

.proficiency-mark--double::after {
  inset: 0;
  border: 2px solid currentColor;
}
</style>
