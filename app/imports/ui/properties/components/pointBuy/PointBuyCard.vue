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
      {{ model.name || $t('cards.pointBuy') }}
    </v-card-title>
    <v-card-text>
      {{ model.spent }}
      <template v-if="model.total && (typeof model.total.value === 'number')">
        / {{ model.total && model.total.value }}
      </template>
    </v-card-text>
    <v-spacer />
    <v-card-actions>
      <v-btn
        variant="tonal"
        color="primary"
        prepend-icon="mdi-pencil"
        @click.stop="$emit('click')"
      >
        {{ $t('build.assignScores') }}
      </v-btn>
      <v-spacer />
      <v-btn
        variant="text"
        icon
        size="small"
        :aria-label="$t('build.hideCard')"
        @click.stop="$emit('ignore')"
      >
        <v-icon>mdi-eye-off-outline</v-icon>
        <v-tooltip
          activator="parent"
          location="top"
          :text="$t('build.hideCardHint')"
        />
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, computed} from 'vue';
import { useTheme } from 'vuetify';

import CardHighlight from '/imports/ui/components/CardHighlight.vue';
import useThemeState from '/imports/ui/composables/useThemeState';

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
