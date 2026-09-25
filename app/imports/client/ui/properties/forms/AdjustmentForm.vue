<template>
  <div class="adjustment-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-combobox
          :label="$t('forms.attributeLabel')"
          :hint="$t('forms.adjustment.attributeHint')"
          style="flex-basis: 300px;"
          :items="attributeList"
          :value="model.stat"
          :error-messages="errors.stat"
          @change="(value, ack) => change('stat', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          :label="$t('forms.amount')"
          :hint="model.operation === 'set' ? setHint : damageHint"
          :model="model.amount"
          :error-messages="errors.amount"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['amount', ...path], value, ack})"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-toggle
          :label="$t('forms.operation')"
          :hint="$t('forms.adjustment.operationHint')"
          :value="model.operation"
          :options="[
            { name: $t('forms.adjustment.damage'), value: 'increment' },
            { name: $t('forms.adjustment.set'), value: 'set' },
          ]"
          :error-messages="errors.operation"
          @change="(value, ack) => change('operation', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-toggle
          :label="$t('forms.targetCreature')"
          :value="model.target"
          :options="[
            {name: $t('forms.actionTarget'), value: 'target'},
            {name: $t('forms.self'), value: 'self'},
          ]"
          :error-messages="errors.target"
          @change="(value, ack) => change('target', value, ack)"
        />
      </v-col>
    </v-row>
    <form-sections type="adjustment">
      <form-section :name="$t('forms.log')">
        <smart-switch
          :label="$t('forms.dontShowInLog')"
          :value="model.silent"
          :error-messages="errors.silent"
          @change="(value, ack) => change('silent', value, ack)"
        />
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { useAttributeList } from '/imports/client/ui/properties/forms/shared/lists/useAttributeList';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps({
  model: {
    type: Object,
    required: true,
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change']);

const attributeList = useAttributeList();

const damageHint = t('forms.adjustment.damageHint');
const setHint = t('forms.adjustment.setHint');

function change(field, value, ack) {
  emit('change', { path: [field], value, ack });
}
</script>

<style lang="css" scoped>

</style>
