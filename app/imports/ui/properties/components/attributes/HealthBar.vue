<template>
  <div
    class="d-flex flex-1-1 flex-wrap align-center justify-center my-1 health-bar"
    style="min-height: 42px;"
    :class="{ hover }"
    :data-id="model._id"
  >
    <div
      class="text-body-large text-truncate pa-2 name"
      role="button"
      tabindex="0"
      @mouseover="hover = true"
      @mouseleave="hover = false"
      @click="$emit('click')"
      @keydown.enter.prevent="$emit('click')"
      @keydown.space.prevent="$emit('click')"
    >
      {{ model.name }}
    </div>
    <div
      ref="barElement"
      style="height: 24px; flex: 100 1 300px;"
    >
      <health-bar-progress
        :model="model"
        style="cursor: pointer;"
        role="button"
        tabindex="0"
        :aria-label="$t('stats.changeHealth', { name: model.name, value: model.value, total: model.total })"
        data-id="health-bar-value"
        @click="edit"
        @keydown.enter.prevent="editFromKeyboard"
        @keydown.space.prevent="editFromKeyboard"
      >
        <div
          class="value"
          :class="{
            'text-white': isTextLight,
            'text-black': !isTextLight,
          }"
          style="font-size: 15px;
              line-height: 24px;
              font-weight: 600;
              position: absolute;
              left: 0;
              top: 0;
              right: 0;
              bottom: 0;
              text-align: center;
              font-variant-numeric: tabular-nums;"
        >
          {{ shownValue }} / {{ model.total }}
        </div>
        <health-delta
          :delta="delta"
          :change-key="changeKey"
        />
      </health-bar-progress>
      <!-- Under the bar, which stays in view (on a phone the menu used to cover it) -->
      <v-menu
        v-model="editing"
        location="bottom center"
        :offset="8"
        :target="barElement"
        :close-on-content-click="false"
      >
        <health-change-menu
          :name="model.name"
          :value="model.value"
          :open="editing"
          @change="changeHealth"
          @close="cancelEdit"
        />
      </v-menu>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick} from 'vue';
import { useTheme } from 'vuetify';
import chroma from 'chroma-js';
import HealthChangeMenu from '/imports/ui/properties/components/attributes/HealthChangeMenu.vue';
import isDarkColor from '/imports/ui/utility/isDarkColor';
import HealthBarProgress from '/imports/ui/properties/components/attributes/HealthBarProgress.vue';
import HealthDelta from '/imports/ui/properties/components/attributes/HealthDelta.vue';
import useHealthChange from '/imports/ui/composables/useHealthChange';
import useTweenedNumber from '/imports/ui/composables/useTweenedNumber';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['click', 'change']);

const vuetifyTheme = useTheme();

// The value counts to its new number; "−7" shows what changed
const shownValue = useTweenedNumber(() => props.model.value);
const { delta, changeKey } = useHealthChange(() => props.model);

const editing = ref(false);
const hover = ref(false);
const barElement = ref(null);

const color = computed(() => {
  return props.model.color || vuetifyTheme.current.value.colors.primary;
});

const barColor = computed(() => {
  const fraction = props.model.value / props.model.total;
  if (!Number.isFinite(fraction)) return color.value;
  if (fraction > 0.5) {
    return color.value;
  } else if (props.model.healthBarColorMid && props.model.healthBarColorLow) {
    return chroma.mix(props.model.healthBarColorLow, props.model.healthBarColorMid, fraction * 2).hex();
  } else if (props.model.healthBarColorMid) {
    return props.model.healthBarColorMid;
  }
  return color.value;
});

const barBackgroundColor = computed(() => {
  return chroma(barColor.value)
    .darken(1.5)
    .desaturate(1.5)
    .hex();
});

// The value is centred on the bar: it sits on the filled part from half full
const isTextLight = computed(() => {
  const fraction = props.model.value / props.model.total;
  return isDarkColor(fraction >= 0.5 ? barColor.value : barBackgroundColor.value);
});

function edit(e) {
  e?.preventDefault?.();
  editing.value = false;
  nextTick(() => {
    editing.value = true;
  });
}

const editFromKeyboard = edit;

function cancelEdit() {
  editing.value = false;
}

// { mode: 'damage' | 'healing' | 'set', value, damageType }: see applyHealthChange
function changeHealth(change) {
  emit('change', change);
  editing.value = false;
}
</script>

<style scoped>
.health-bar {
  background: inherit;
}

.name {
  text-align: center;
  cursor: pointer;
  min-width: 150px;
  flex-basis: 150px;
  flex-grow: 1;
  flex-shrink: 1;
}

.name:hover {
  font-weight: 500;
}

.hover {
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
}
</style>
