<template>
  <div class="action-form">
    <v-row dense>
      <v-col
        cols="12"
        md="8"
      >
        <v-slide-x-transition mode="out-in">
          <v-switch
            v-if="!isAttack"
            class="ml-4"
            :label="$t('forms.attackRoll')"
            :value="attackSwitch"
            @update:model-value="e => attackSwitch = e"
          />
          <computed-field
            v-else
            :label="$t('forms.action.baseAttackBonus')"
            :hint="$t('forms.action.baseAttackBonusHint')"
            :model="model.attackRoll"
            :error-messages="errors.attackRoll"
            @change="({path, value, ack}) =>
              $emit('change', {path: ['attackRoll', ...path], value, ack})"
          >
            <template #prepend>
              <v-btn
                variant="text"
                :disabled="!!(model.attackRoll && model.attackRoll.calculation)"
                icon
                style="margin-top: -12px;"
                @click="attackSwitch = false"
              >
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </template>
          </computed-field>
        </v-slide-x-transition>
      </v-col>
      <v-col
        cols="12"
        md="4"
      >
        <smart-select
          :label="$t('forms.action.actionType')"
          :items="actionTypes"
          :value="model.actionType"
          :error-messages="errors.actionType"
          :menu-props="{auto: true, lazy: true}"
          :hint="actionTypeHints[model.actionType]"
          @change="(value, ack) => change('actionType', value, ack)"
        />
      </v-col>
    </v-row>

    <v-slide-x-transition mode="out-in">
      <text-field
        v-if="model.actionType === 'event'"
        :label="$t('forms.action.eventVariableName')"
        :value="model.variableName"
        :hint="$t('forms.action.eventVariableNameHint')"
        :error-messages="errors.variableName"
        @change="(value, ack) => change('variableName', value, ack)"
      />
    </v-slide-x-transition>

    <smart-toggle
      :label="$t('forms.targetCreature')"
      :value="model.target"
      :options="[
        {name: $t('forms.singleTarget'), value: 'singleTarget'},
        {name: $t('forms.multipleTargets'), value: 'multipleTargets'},
        {name: $t('forms.self'), value: 'self'},
      ]"
      :error-messages="errors.target"
      @change="(value, ack) => change('target', value, ack)"
    />

    <inline-computation-field
      :label="$t('forms.summary')"
      :hint="$t('forms.action.summaryHint')"
      :model="model.summary"
      :error-messages="errors['summary.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['summary', ...path], value, ack})"
    />

    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections type="action">
      <form-section :name="$t('forms.resourcesConsumed')">
        <resources-form
          :model="model.resources"
          @change="({path, value, ack}) => $emit('change', {path: ['resources', ...path], value, ack})"
          @push="({path, value, ack}) => $emit('push', {path: ['resources', ...path], value, ack})"
          @pull="({path, ack}) => $emit('pull', {path: ['resources', ...path], ack})"
        />
      </form-section>
      <form-section :name="$t('forms.limitUses')">
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <computed-field
              :label="$t('forms.uses')"
              :hint="$t('forms.usesHint')"
              class="mr-2"
              :model="model.uses"
              :error-messages="errors.uses"
              @change="({path, value, ack}) =>
                $emit('change', {path: ['uses', ...path], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <text-field
              :label="$t('forms.usesUsed')"
              type="number"
              :hint="$t('forms.usesUsedHint')"
              style="flex-basis: 300px;"
              :value="model.usesUsed"
              :error-messages="errors.uses"
              @change="(value, ack) => change('usesUsed', value, ack)"
            />
          </v-col>
        </v-row>
        <reset-selector
          :hint="$t('forms.resetUsesHint')"
          :value="model.reset"
          :error-messages="errors.reset"
          @change="(value, ack) => change('reset', value, ack)"
        />
      </form-section>
      <form-section :name="$t('forms.log')">
        <smart-switch
          :label="$t('forms.dontShowInLog')"
          class="ml-4 mt-0 mb-4"
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
import ResourcesForm from '/imports/client/ui/properties/forms/ResourcesForm.vue';
import ResetSelector from '/imports/client/ui/components/ResetSelector.vue';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
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
});

const emit = defineEmits(['change', 'push', 'pull']);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}

const actionTypes = [
  {
    title: t('forms.actionTypes.action'),
    value: 'action',
  }, {
    title: t('forms.actionTypes.bonus'),
    value: 'bonus',
  }, {
    title: t('forms.actionTypes.attack'),
    value: 'attack',
    help: t('forms.actionTypes.attackHelp'),
  }, {
    title: t('forms.actionTypes.reaction'),
    value: 'reaction',
  }, {
    title: t('forms.actionTypes.free'),
    value: 'free',
    help: t('forms.actionTypes.freeHelp'),
  }, {
    title: t('forms.actionTypes.long'),
    value: 'long',
    help: t('forms.actionTypes.longHelp'),
  }, {
    title: t('forms.actionTypes.event'),
    value: 'event',
    help: t('forms.actionTypes.eventHelp'),
  },
];

const attackSwitch = ref(false);

const actionTypeHints = {};
actionTypes.forEach(type => {
  actionTypeHints[type.value] = type.help;
});

const isAttack = computed(() => {
  return attackSwitch.value || !!props.model.attackRoll?.calculation;
});
</script>

<style lang="css" scoped>
  .no-flex {
    flex: initial;
  }
  .layout.row.wrap {
    margin-right: -8px;
  }
  .layout.row.wrap > *{
    margin-right: 8px;
  }
</style>
