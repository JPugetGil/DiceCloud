<template>
  <div
    class="d-flex flex-1-1 flex-wrap align-center justify-center my-1 health-bar"
    style="min-height: 42px;"
    :class="{ hover }"
    :data-id="model._id"
  >
    <div
      class="text-body-large text-truncate pa-2 name"
      @mouseover="hover = true"
      @mouseleave="hover = false"
      @click="$emit('click')"
    >
      {{ model.name }}
    </div>
    <div
      style="height: 24px; flex: 100 1 300px;"
    >
      <health-bar-progress
        :model="model"
        style="cursor: pointer;"
        @click="edit"
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
              text-align: center;"
        >
          {{ model.value }} / {{ model.total }}
        </div>
      </health-bar-progress>
      <v-menu
        v-model="editing"
        transition="scale-transition"
        origin="center center"
        content-class="no-menu-shadow"
        :target="[x, y]"
        :min-width="305"
        :close-on-content-click="false"
      >
        <increment-menu
          :value="model.value"
          :open="editing"
          @change="changeIncrementMenu"
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
import IncrementMenu from '/imports/ui/components/IncrementMenu.vue';
import isDarkColor from '/imports/ui/utility/isDarkColor';
import HealthBarProgress from '/imports/ui/properties/components/attributes/HealthBarProgress.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  _id: {
    type: String,
    default: undefined,
  },
});

const emit = defineEmits(['click', 'change']);


const vuetifyTheme = useTheme();

const editing = ref(false);
const hover = ref(false);
const x = ref(0);
const y = ref(0);


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

const isTextLight = computed(() => {
  return isDarkColor(barBackgroundColor.value);
  /* Change color at the halfway mark
  const fraction = this.model.value / this.model.total;
  if (fraction >= 0.5){
    return isDarkColor(this.barColor);
  } else {
    return isDarkColor(this.barBackgroundColor);
  }
  */
});

function edit(e) {
  e.preventDefault();
  editing.value = false;
  x.value = e.clientX - 165;
  y.value = e.clientY - 24;
  nextTick(() => {
    editing.value = true;
  });
}

function cancelEdit() {
  editing.value = false;
}

function changeIncrementMenu({ type, value }) {
  if (type === 'increment') value = -value;
  emit('change', { type, value });
  editing.value = false;
}
</script>

<style>
.health-bar .increment-menu {
  margin-left: -50%;
  margin-right: -50%;
  width: 200%;
  margin-top: -34px;
  z-index: 7;
  position: relative;
}

.no-menu-shadow {
  box-shadow: none;
}
</style>

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
  background: #f5f5f5 !important;
}

.v-theme--dark .hover {
  background: #515151 !important;
}
</style>
