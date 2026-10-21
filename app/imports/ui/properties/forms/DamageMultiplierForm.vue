<template>
  <div class="damage-multiplier-form">
    <v-row density="compact">
      <v-col
        cols="12"
      >
        <smart-toggle
          :label="$t('forms.damageMultiplier.multiplier')"
          :model-value="model.value"
          :options="[{
            value: 2,
            name: $t('damageMultipliers.vulnerability'),
          },{
            value: 0.5,
            name: $t('damageMultipliers.resistance'),
          }, {
            value: 0,
            name: $t('damageMultipliers.immunity'),
          }]"
          :error-messages="errors.value"
          @change="(value, ack) => change('value', value, ack)"
        />
      </v-col>
    </v-row>
    <v-row density="compact">
      <v-col cols="12">
        <smart-combobox
          :label="$t('forms.damageMultiplier.damageTypes')"
          multiple
          chips
          closable-chips
          :rules="damageTypeRules"
          :items="damageTypeItems"
          :return-object="false"
          :model-value="model.damageTypes"
          :error-messages="errors.damageTypes"
          @change="(value, ack) => change('damageTypes', value, ack)"
        />
      </v-col>
    </v-row>
    <form-sections type="damageMultiplier">
      <form-section
        v-if="$slots.children"
        :name="$t('forms.children')"
      >
        <slot name="children" />
      </form-section>
      <form-section :name="$t('forms.damageMultiplier.applyByTag')">
        <v-row density="compact">
          <v-col cols="12">
            <smart-combobox
              :label="$t('forms.damageMultiplier.tagsRequired')"
              :hint="$t('forms.damageMultiplier.tagsRequiredHint')"
              multiple
              chips
              closable-chips
              persistent-hint
              :items="['magical', 'silvered']"
              :model-value="model.includeTags"
              @change="(value, ack) => change('includeTags', value, ack)"
            />
          </v-col>
          <v-col cols="12">
            <smart-combobox
              :label="$t('forms.damageMultiplier.tagsExcluded')"
              :hint="$t('forms.damageMultiplier.tagsExcludedHint')"
              multiple
              chips
              closable-chips
              persistent-hint
              :items="['magical', 'silvered']"
              :model-value="model.excludeTags"
              @change="(value, ack) => change('excludeTags', value, ack)"
            />
          </v-col>
        </v-row>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import FormSection from '/imports/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/ui/properties/forms/shared/FormSections.vue';
import VARIABLE_NAME_REGEX from '/imports/constants/VARIABLE_NAME_REGEX';
import { computed } from 'vue';
import DAMAGE_TYPES from '/imports/constants/DAMAGE_TYPES';
import { damageTypeName } from '/imports/ui/i18n';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change']);

const damageTypeRules = [
  value => {
    if (value && value.length) {
      for (let i = 0; i < value.length; i++) {
        if (!VARIABLE_NAME_REGEX.test(value[i])) {
          return t('forms.damage.invalidType', { value: value[i] })
        }
      }
    }
  }
];

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}

// Shown in the user's language; the type stored stays the English one, or
// what the user typed
const damageTypeItems = computed(() => DAMAGE_TYPES.map(type => ({ title: damageTypeName(type), value: type })));
</script>
