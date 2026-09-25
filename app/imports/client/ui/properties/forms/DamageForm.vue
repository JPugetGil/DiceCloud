<template>
  <div>
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          ref="focusFirst"
          :label="$t('forms.attribute.damage')"
          :hint="$t('forms.damage.damageHint')"
          :model="model.amount"
          :error-messages="errors.amount"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['amount', ...path], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-combobox
          :label="$t('forms.damage.damageType')"
          style="flex-basis: 200px;"
          :hint="$t('forms.damage.damageTypeHint')"
          :rules="damageTypeRules"
          :items="DAMAGE_TYPES"
          :value="model.damageType"
          :error-messages="errors.damageType"
          :menu-props="{auto: true}"
          @change="(...args) => change('damageType', ...args)"
        />
      </v-col>
      <v-col cols="12">
        <smart-toggle
          :label="$t('forms.targetCreature')"
          :value="model.target"
          :options="[
            {name: $t('forms.actionTarget'), value: 'target'},
            {name: $t('forms.self'), value: 'self'},
          ]"
          :error-messages="errors.target"
          @change="(...args) => change('target', ...args)"
        />
      </v-col>
      <v-col cols="12">
        <smart-switch
          class="mt-0"
          :label="$t('forms.damage.savingThrow')"
          :value="!!model.save"
          :error-messages="errors.save"
          @change="(val, ack) => $emit('change', {
            path: ['save'],
            value: val ? {} : undefined,
            ack
          })"
        />
      </v-col>
    </v-row>
    <v-expand-transition>
      <v-row
        v-if="model.save"
        dense
      >
        <v-col
          cols="12"
          md="6"
        >
          <computed-field
            :label="$t('check.dc')"
            :hint="$t('forms.dcHint')"
            :model="model.save.dc"
            :error-messages="errors['save.dc']"
            @change="({path, value, ack}) =>
              $emit('change', {path: ['save', 'dc', ...path], value, ack})"
          />
        </v-col>
        <v-col
          cols="12"
          md="6"
        >
          <smart-combobox
            :label="$t('forms.save')"
            :hint="$t('forms.saveHint')"
            :value="model.save.stat"
            :items="saveList"
            :error-messages="errors['save.stat']"
            @change="(value, ack) =>
              $emit('change', {path: ['save', 'stat'], value, ack})"
          />
        </v-col>
        <v-col cols="12">
          <computed-field
            v-if="!!model.save"
            :label="$t('forms.damage.onSave')"
            :hint="$t('forms.damage.onSaveHint')"
            :placeholder="$t('forms.damage.halfDamage')"
            persistent-placeholder
            :model="model.save.damageFunction"
            :error-messages="errors['save.damageFunction']"
            @change="({path, value, ack}) =>
              $emit('change', {path: ['save', 'damageFunction', ...path], value, ack})"
          />
        </v-col>
      </v-row>
    </v-expand-transition>
    <form-sections type="damage">
      <form-section :name="$t('forms.log')">
        <v-row>
          <v-col cols="12">
            <smart-switch
              :label="$t('forms.dontShowInLog')"
              :value="model.silent"
              :error-messages="errors.silent"
              @change="(...args) => change('silent', ...args)"
            />
          </v-col>
        </v-row>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import DAMAGE_TYPES from '/imports/constants/DAMAGE_TYPES';
import VARIABLE_NAME_REGEX from '/imports/constants/VARIABLE_NAME_REGEX';
import { useSaveList } from '/imports/client/ui/properties/forms/shared/lists/useSaveList';

import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
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
  parentTarget: {
    type: String,
    default: undefined,
  },
});

const emit = defineEmits(['change']);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}

const saveList = useSaveList();

const damageTypeRules = [
  value => {
    if (!value) return t('forms.damage.typeRequired');
    if (!VARIABLE_NAME_REGEX.test(value)) {
      return t('forms.damage.invalidType', { value });
    }
  }
];



</script>

<style lang="css" scoped>

</style>
