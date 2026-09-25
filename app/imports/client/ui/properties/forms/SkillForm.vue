<template>
  <div class="skill-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          :label="$t('forms.variableName')"
          :value="model.variableName"
          style="flex-basis: 300px;"
          :hint="$t('forms.skill.variableNameHint')"
          :error-messages="errors.variableName"
          @change="(...args) => change('variableName', ...args)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-combobox
          :label="$t('check.ability')"
          :value="model.ability"
          style="flex-basis: 300px;"
          :hint="$t('forms.skill.abilityHint')"
          :items="abilityScoreList"
          :error-messages="errors.ability"
          @change="(...args) => change('ability', ...args)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-select
          :label="$t('common.type')"
          clearable
          :items="skillTypes"
          :value="model.skillType"
          :error-messages="errors.skillType"
          :menu-props="{auto: true, lazy: true}"
          :hint="skillTypeHints[model.skillType]"
          @change="(...args) => change('skillType', ...args)"
        />
      </v-col>
    </v-row>
    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections type="skill">
      <form-section :name="$t('forms.skill.baseValues')">
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <proficiency-select
              :label="$t('forms.skill.baseProficiency')"
              :value="model.baseProficiency"
              :error-messages="errors.baseProficiency"
              @change="(...args) => change('baseProficiency', ...args)"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <computed-field
              :label="$t('forms.attribute.baseValue')"
              :hint="$t('forms.skill.baseValueHint')"
              :model="model.baseValue"
              :error-messages="errors.baseValue"
              @change="({path, value, ack}) =>
                $emit('change', {path: ['baseValue', ...path], value, ack})"
            />
          </v-col>
        </v-row>
      </form-section>
      <form-section :name="$t('forms.skill.applySkill')">
        <smart-switch
          :label="$t('forms.skill.applyToTags')"
          :value="model.targetByTags"
          :error-messages="errors.targetByTags"
          @change="(...args) => change('targetByTags', ...args)"
        />
        <v-expand-transition>
          <tag-targeting
            v-if="model.targetByTags"
            :model="model"
            :errors="errors"
            @change="e => $emit('change', e)"
            @push="e => $emit('push', e)"
            @pull="e => $emit('pull', e)"
          />
        </v-expand-transition>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { autorun } from 'vue-meteor-tracker';
import ProficiencySelect from '/imports/client/ui/properties/forms/shared/ProficiencySelect.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import createListOfProperties from '/imports/client/ui/properties/forms/shared/lists/createListOfProperties';
import TagTargeting from '/imports/client/ui/properties/forms/shared/TagTargeting.vue';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change', 'push', 'pull']);

const skillTypes = [
  {
    title: t('skillTypes.skill'),
    value: 'skill',
  }, {
    title: t('skillTypes.save'),
    value: 'save',
  }, {
    title: t('skillTypes.check'),
    value: 'check',
  }, {
    title: t('skillTypes.tool'),
    value: 'tool',
  }, {
    title: t('skillTypes.weapon'),
    value: 'weapon',
  }, {
    title: t('skillTypes.armor'),
    value: 'armor',
  }, {
    title: t('skillTypes.language'),
    value: 'language',
  }, {
    title: t('skillTypes.utility'),
    value: 'utility',
  },
];

const skillTypeHints = {
  skill: t('skillTypeHints.skill'),
  'save': t('skillTypeHints.save'),
  'check': t('skillTypeHints.check'),
  'tool': t('skillTypeHints.tool'),
  'weapon': t('skillTypeHints.weapon'),
  'armor': t('skillTypeHints.armor'),
  'language': t('skillTypeHints.language'),
  'utility': t('skillTypeHints.utility'),
};

const abilityScoreList = autorun(() => {
  return createListOfProperties({
    type: 'attribute',
    attributeType: 'ability',
  });
}).result;

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>

<style lang="css" scoped>

</style>
