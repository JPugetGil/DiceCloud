<template>
  <div class="proficiency-viewer">
    <v-row dense>
      <property-field
        v-if="model.value !== undefined"
        :name="$t('propertyTypes.proficiency.name')"
      >
        <proficiency-icon
          :value="model.value"
          style="height: 12px"
          class="ml-1 mr-2"
        />
        <div>
          {{ proficiencyText }}
        </div>
      </property-field>
      <property-target-tags
        v-if="model.targetByTags"
        :model="model"
      />
      <property-field
        v-else
        :name="$t('viewers.stats')"
        :value="model.stats && model.stats.join(', ')"
        mono
      />
    </v-row>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ProficiencyIcon from '/imports/client/ui/properties/shared/ProficiencyIcon.vue';
import PropertyTargetTags from '/imports/client/ui/properties/viewers/shared/PropertyTargetTags.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const proficiencyText = computed(() => {
  switch (props.model.value){
    case 0.49: return t('proficiencyLevels.halfDown');
    case 0.5: return t('proficiencyLevels.half');
    case 1: return t('proficiencyLevels.proficient');
    case 2: return t('proficiencyLevels.double');
    default: return '';
  }
});
</script>
