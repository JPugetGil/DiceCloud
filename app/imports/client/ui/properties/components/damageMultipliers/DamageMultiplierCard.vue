<template>
  <div>
    <v-card>
      <v-list>
        <v-list-item
          v-for="multiplier in multipliers"
          :key="multiplier._id"
          :data-id="multiplier._id"
          @click="$emit('click-multiplier', {_id: multiplier._id})"
        >
          <v-list-item-title>
            {{ title(multiplier) }}
          </v-list-item-title>
          <v-list-item-subtitle v-if="multiplier.name">
            {{ multiplier.name }}
          </v-list-item-subtitle>
          <v-list-item-subtitle class="d-flex flex-wrap align-center">
            <v-chip
              v-for="(damageType, index) in multiplier.damageTypes"
              :key="index"
              class="my-1 mr-1"
              style="cursor: pointer"
              :model-value="true"
              variant="outlined"
              size="small"
              label
            >
              {{ damageType }}
            </v-chip>
          </v-list-item-subtitle>
          <v-list-item-subtitle
            v-if="multiplier.includeTags && multiplier.includeTags.length"
            class="d-flex flex-wrap align-center"
          >
            <div>
              {{ $t('damageMultipliers.for') }}
            </div>
            <v-chip
              v-for="(damageType, index) in multiplier.includeTags"
              :key="index"
              class="ma-1"
              style="cursor: pointer"
              :model-value="true"
              size="small"
              variant="outlined"
            >
              {{ damageType }}
            </v-chip>
          </v-list-item-subtitle>
          <v-list-item-subtitle
            v-if="multiplier.excludeTags && multiplier.excludeTags.length"
            class="d-flex flex-wrap align-center"
          >
            <div>
              {{ $t('damageMultipliers.except') }}
            </div>
            <v-chip
              v-for="(damageType, index) in multiplier.excludeTags"
              :key="index"
              class="ma-1"
              style="cursor: pointer"
              :model-value="true"
              size="small"
              variant="outlined"
            >
              {{ damageType }}
            </v-chip>
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-card>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
defineProps({
  multipliers: {
    type: Array,
    required: true,
  },
});

defineEmits(['click-multiplier']);

function title(prop) {
  switch (prop.value) {
    case 0: return t('damageMultipliers.immunity');
    case 0.5: return t('damageMultipliers.resistance');
    case 2: return t('damageMultipliers.vulnerability');
  }
}
</script>

<style lang="css" scoped>
</style>
