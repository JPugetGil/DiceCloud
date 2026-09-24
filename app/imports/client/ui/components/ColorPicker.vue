<template>
  <v-menu
    v-model="opened"
    :close-on-content-click="false"
    transition="slide-y-transition"
    location="left"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        variant="text"
        :icon="!label"
        :tile="!label"
        :min-width="label && 108"
        :height="height"
        :width="width"
        :disabled="context.editPermission === false"
        v-bind="activatorProps"
      >
        {{ label }}
        <v-icon
          :end="!!label"
          :color="noColorChange ? undefined : value"
        >
          mdi-format-paint
        </v-icon>
      </v-btn>
    </template>
    <v-card class="overflow-hidden">
      <v-card-text>
        <div class="d-flex flex-1-1 flex-wrap">
          <div
            v-for="colorOption in colors"
            :key="colorOption"
            :class="[colorOption, shade]"
            class="color-swatch d-flex align-center"
            @click="color = colorOption"
          >
            <v-scroll-y-transition>
              <v-icon
                v-if="kebabColor === colorOption"
                :class="{dark: isDark(colorOption, shade)}"
              >
                mdi-check
              </v-icon>
            </v-scroll-y-transition>
          </div>
          <div
            v-for="i in 8"
            :key="i"
            class="flex-grow-1"
          />
        </div>
        <v-fade-transition>
          <div
            v-show="color"
            class="d-flex flex-1-1 flex-wrap mt-2"
          >
            <div
              v-for="shadeOption in shades"
              :key="shadeOption"
              :class="[kebabColor, shadeOption]"
              class="shade-swatch d-flex align-center"
              @click="shade = shadeOption"
            >
              <v-scroll-y-transition>
                <v-icon
                  v-if="kebabShade === shadeOption"
                  :class="isDark(color, shade) ? 'dark' : 'light'"
                >
                  mdi-check
                </v-icon>
              </v-scroll-y-transition>
            </div>
            <div
              v-for="i in 8"
              :key="i"
              class="flex-grow-1"
            />
          </div>
        </v-fade-transition>
      </v-card-text>
      <v-card-actions>
        <v-btn
          variant="text"
          @click="$emit('input')"
        >
          Clear
        </v-btn>
        <v-spacer />
        <v-btn
          variant="text"
          @click="opened = false"
        >
          Done
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<script setup lang="js">
import { ref, computed, inject } from 'vue';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';
import vuetifyColors from 'vuetify/util/colors';
import { kebabToCamelCase, camelToKebabCase } from '/imports/client/ui/utility/swapCase';

const props = defineProps({
  //hex string
  value: {
    type: String,
    default: undefined,
  },
  label: {
    type: String,
    default: undefined,
  },
  height: {
    type: Number,
    default: undefined,
  },
  width: {
    type: Number,
    default: undefined,
  },
  noColorChange: Boolean,
});

const emit = defineEmits(['input']);

const context = inject('context', {});

function colorToHex(color, shade = 'base'){
  if (!color) return;
  color = kebabToCamelCase(color);
  shade = kebabToCamelCase(shade);
  return vuetifyColors[color] && vuetifyColors[color][shade];
}

// Create an index of hex colors and what color/shade combination makes them
let colorIndex = {};
for (let c in vuetifyColors){
  const color = kebabToCamelCase(c);
  for (let s in vuetifyColors[c]){
    const shade = kebabToCamelCase(s);
    colorIndex[vuetifyColors[c][s]] = {color, shade};
  }
}

function hexToColor(hex){
  if (!hex) return undefined;
  return colorIndex[hex.toLowerCase()];
}

const colors = [
  'red',
  'pink',
  'purple',
  'deep-purple',
  'indigo',
  'blue',
  'light-blue',
  'cyan',
  'teal',
  'green',
  'light-green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'deep-orange',
  'brown',
  'grey',
];

const shades = [
  'lighten-4',
  'lighten-3',
  'lighten-2',
  'lighten-1',
  'base',
  'darken-1',
  'darken-2',
  'darken-3',
  'darken-4',
];

const opened = ref(false);

const combination = computed(() => {
  if (!props.value) return;
  return hexToColor(props.value) || {};
});

const color = computed({
  get() {
    return combination.value && combination.value.color;
  },
  set(newColor) {
    emit('input', colorToHex(newColor, shade.value));
  },
});

const shade = computed({
  get() {
    return combination.value && combination.value.shade;
  },
  set(newShade) {
    emit('input', colorToHex(color.value, newShade));
  },
});

const kebabColor = computed(() => {
  return camelToKebabCase(color.value);
});

const kebabShade = computed(() => {
  return camelToKebabCase(shade.value);
});

function isDark(kbColor, kbShade){
  let hexColor = colorToHex(kbColor, kbShade);
  return isDarkColor(hexColor);
}
</script>

<style lang="css" scoped>
  .color-swatch, .shade-swatch {
    height: 30px;
    width: 30px;
    flex-grow: 1;
    cursor: pointer;
    transition: all 0.2s linear;
  }
  .color-swatch:hover{
    z-index: 1;
    transform: scale(1.1);
    box-shadow: 0px 2px 1px -1px rgba(0,0,0,0.2),
      0px 1px 1px 0px rgba(0,0,0,0.14),
      0px 1px 3px 0px rgba(0,0,0,0.12);
  }
  .v-icon {
    height: 30px;
  }
  .v-icon {
    color: black;
  }
  .dark.v-icon {
    color: white;
  }
  .layout {
    max-width: 270px;
  }
  .spacer {
    width: 30px;
    height: 0;
    flex-grow: 1;
  }
</style>
