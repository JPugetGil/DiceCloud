<template>
  <div class="buff-form">
    <smart-select
      :label="$t('forms.branch.branchType')"
      :items="typeOptions"
      :hint="typeHint"
      :value="model.branchType"
      :error-messages="errors.branchType"
      :menu-props="{auto: true, lazy: true}"
      @change="(value, ack) => change('branchType', value, ack)"
    />
    <v-expand-transition>
      <computed-field
        v-if="model.branchType === 'if'"
        :label="$t('forms.condition')"
        :hint="$t('forms.branch.conditionHint')"
        :model="model.condition"
        :error-messages="errors.condition"
        @change="({path, value, ack}) =>
          $emit('change', {path: ['condition', ...path], value, ack})"
      />
      <computed-field
        v-else-if="model.branchType === 'index'"
        :label="$t('forms.branch.index')"
        :hint="$t('forms.branch.indexHint')"
        :model="model.condition"
        :error-messages="errors.condition"
        @change="({path, value, ack}) =>
          $emit('change', {path: ['condition', ...path], value, ack})"
      />
    </v-expand-transition>
    <form-sections type="branch">
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
import { ref, computed } from 'vue';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
  parentTarget: {
    type: String,
    default: undefined,
  },
});

const emit = defineEmits(['change']);

const typeOptions = ref([
  { value: 'if', title: t('forms.branchTypes.if') },
  { value: 'hit', title: t('forms.branchTypes.hit') },
  { value: 'miss', title: t('forms.branchTypes.miss') },
  { value: 'failedSave', title: t('forms.branchTypes.failedSave') },
  { value: 'successfulSave', title: t('forms.branchTypes.successfulSave') },
  { value: 'eachTarget', title: t('forms.branchTypes.eachTarget') },
  { value: 'random', title: t('forms.branchTypes.random') },
  { value: 'index', title: t('forms.branchTypes.index') },
  { value: 'choice', title: t('forms.branchTypes.choice') },
]);

const typeHint = computed(() => {
  switch (props.model.branchType) {
    case 'if': return t('forms.branchHelp.if');
    case 'hit': return t('forms.branchHelp.hit');
    case 'miss': return t('forms.branchHelp.miss');
    case 'failedSave': return t('forms.branchHelp.failedSave');
    case 'successfulSave': return t('forms.branchHelp.successfulSave');
    case 'eachTarget': return t('forms.branchHelp.eachTarget');
    case 'random': return t('forms.branchHelp.random');
    case 'index': return t('forms.branchHelp.index');
    case 'choice': return t('forms.branchHelp.choice');
    default: return '';
  }
});

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>

<style lang="css" scoped>

</style>
