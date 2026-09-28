<template>
  <div class="slot-viewer">
    <v-row dense>
      <property-field
        :name="$t('viewers.variableName')"
        mono
        :value="model.variableName"
      />
      <property-field
        :name="$t('viewers.conditionResult')"
        :value="model.slotCondition && (model.slotCondition.value || model.slotCondition.calculation)"
      />
      <property-field
        :name="$t('viewers.fillWithType')"
        :value="slotTypeName"
      />
      <property-field
        :name="$t('forms.quantity')"
        :calculation="model.quantityExpected"
      />
      <property-field
        :name="$t('forms.slot.unique')"
        :value="uniqueText"
      />
      <property-field
        :name="$t('forms.tagsRequired')"
        :cols="{cols: 12}"
      >
        <div>
          <property-tags :tags="model.slotTags" />
          <div
            v-for="tags in model.extraTags"
            :key="tags._id"
          >
            <div class="text-caption">
              {{ tags.operation }}
            </div>
            <property-tags :tags="tags.tags" />
          </div>
        </div>
      </property-field>
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
      <property-field
        v-if="context.creatureId && (!model.quantityExpected || !model.quantityExpected.value || model.spaceLeft)"
        :name="$t('viewers.fill')"
        :cols="{cols: 12}"
      >
        <fill-slot-button :model="model">
          <v-icon start>
            mdi-plus
          </v-icon>
          {{ $t('viewers.fillSlot') }}
        </fill-slot-button>
      </property-field>
    </v-row>
  </div>
</template>

<script setup>
import { inject, computed } from 'vue';
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import FillSlotButton from '/imports/client/ui/creature/buildTree/FillSlotButton.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';
import PropertyTags from '/imports/client/ui/properties/viewers/shared/PropertyTags.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});

const slotTypeName = computed(() => {
  if (!props.model.slotType) return;
  return getPropertyName(props.model.slotType);
});

const uniqueText = computed(() => {
  if (!props.model.unique) return;
  return uniqueText[props.model.unique]
});
</script>
