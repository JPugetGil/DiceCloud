<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    transition="slide-y-transition"
    min-width="290px"
    style="overflow-y: auto;"
    location="left"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        :loading="loading"
        :variant="!!label ? 'outlined' : undefined"
        :icon="!label"
        :tile="!label"
        :min-width="label && 108"
        :height="height"
        :width="width"
        :style="buttonStyle"
        :disabled="context?.editPermission === false"
        v-bind="{ ...$attrs, ...menuProps }"
      >
        {{ label }}
        <svg-icon
          v-if="safeValue && safeValue.shape"
          right
          :class="{'ml-2': !!label}"
          :shape="safeValue.shape"
        />
        <v-icon
          v-else
          :end="!!label"
        >
          mdi-select-search
        </v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-card-text>
        <div class="d-flex flex-1-1 align-center">
          <text-field
            ref="iconSearchField"
            label="Search icons"
            append-icon="mdi-magnify"
            clearable
            hide-details
            class="ma-2"
            :value="searchString"
            @change="search"
          />
          <v-btn
            variant="text"
            @click="select()"
          >
            clear
          </v-btn>
        </div>
        <div
          class="d-flex flex-1-1 flex-wrap"
          style="max-height: 400px; overflow-y: auto;"
        >
          <v-scale-transition
            group
            hide-on-leave
          >
            <v-btn
              v-for="icon in icons"
              :key="icon._id"
              variant="text"
              icon
              size="large"
              @click="select(icon)"
            >
              <svg-icon
                :shape="icon.shape"
                x-large
              />
            </v-btn>
          </v-scale-transition>
        </div>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup>
import { ref, watch, inject } from 'vue';
import SvgIcon from '/imports/client/ui/components/global/SvgIcon.vue';
import { findIcons } from '/imports/api/icons/Icons';
import { useSmartInput } from '/imports/client/ui/components/global/useSmartInput.js';

const props = defineProps({
  label: {
    type: String,
    default: undefined,
  },
  buttonStyle: {
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
  // Props from SmartInputMixin
  value: {
    type: [String, Number, Date, Array, Object, Boolean],
    default: undefined,
  },
  errorMessages: {
    type: [String, Array],
    default: undefined,
  },
  disabled: Boolean,
  debounce: {
    type: Number,
    default: undefined,
  },
  rules: {
    type: Array,
    default: undefined,
  },
});

const emit = defineEmits(['change', 'input', 'update:value']);

const context = inject('context', {});

const menu = ref(false);
const searchString = ref('');
const icons = ref([]);
const iconSearchField = ref(null);

const { loading, safeValue, change } = useSmartInput(props, emit);

watch(menu, (value) => {
  if (value) {
    setTimeout(() => {
      if (iconSearchField.value) {
        if (typeof iconSearchField.value.focus === 'function') {
          iconSearchField.value.focus();
        } else if (iconSearchField.value.$el) {
          const input = iconSearchField.value.$el.querySelector('input');
          if (input) input.focus();
        }
      }
    }, 100);
  }
});

const search = async (value, ack) => {
  searchString.value = value;
  icons.value = [];
  try {
    const result = await findIcons.callAsync({ search: value });
    icons.value = result;
    if (typeof ack === 'function') ack();
  } catch (error) {
    if (typeof ack === 'function') ack(error);
  }
};

const select = (icon) => {
  menu.value = false;
  change(icon);
};
</script>

<style lang="css" scoped>

</style>
