<template>
  <v-card
    v-if="model"
    v-bind="$attrs"
    :data-id="`point-buy-card-${model._id}`"
    :style="`border: solid 1px ${accentColor};`"
    hover
    class="slot-card d-flex flex-column"
    @mouseover="hover = true"
    @mouseleave="hover = false"
    @click="$emit('click')"
  >
    <card-highlight
      :active="hover"
    />
    <v-card-title>
      {{ model.name || 'Point Buy' }}
    </v-card-title>
    <v-card-text>
      {{ model.spent }}
      <template v-if="model.total && (typeof model.total.value === 'number')">
        / {{ model.total && model.total.value }}
      </template>
    </v-card-text>
    <v-spacer />
    <v-card-actions>
      <v-spacer />
      <v-btn
        variant="text"
        icon
        color="accent"
        @click.stop="$emit('ignore')"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, computed} from 'vue';
import { useTheme } from 'vuetify';

import CardHighlight from '/imports/client/ui/components/CardHighlight.vue';
import useThemeState from '/imports/client/ui/utility/useThemeState';

defineProps({
  model: {
    type: Object,
    default: undefined,
  },
});

defineEmits(['click', 'ignore']);

const theme = useThemeState();

const vuetifyTheme = useTheme();

const hover = ref(false);

const accentColor = computed(() => {
  if (theme.isDark) {
    return vuetifyTheme.themes.value.dark.colors.primary;
  } else {
    return vuetifyTheme.themes.value.light.colors.primary;
  }
});
</script>
