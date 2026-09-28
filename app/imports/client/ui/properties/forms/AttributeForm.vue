<template>
  <div class="attribute-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          :label="$t('forms.variableName')"
          :value="model.variableName"
          :hint="$t('forms.variableNameAttributeHint')"
          :error-messages="errors.variableName"
          @change="(value, ack) => change('variableName', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          ref="focusFirst"
          :label="$t('forms.attribute.baseValue')"
          class="base-value-field"
          :hint="$t('forms.attribute.baseValueHint')"
          :model="model.baseValue"
          :error-messages="errors.baseValue"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['baseValue', ...path], value, ack})"
        />
      </v-col>
      <v-col cols="12">
        <smart-select
          :label="$t('common.type')"
          :items="attributeTypes"
          :value="model.attributeType"
          :error-messages="errors.attributeType"
          :menu-props="{auto: true, lazy: true}"
          :hint="attributeTypeHints[model.attributeType]"
          @change="(value, ack) => change('attributeType', value, ack)"
        />
      </v-col>
      <v-expand-transition>
        <v-col
          v-if="model.attributeType === 'hitDice'"
          cols="12"
        >
          <smart-select
            :label="$t('forms.attribute.hitDiceSize')"
            :items="['d4', 'd6', 'd8', 'd10', 'd12', 'd20']"
            :value="model.hitDiceSize"
            :error-messages="errors.hitDiceSize"
            :menu-props="{auto: true, lazy: true}"
            @change="(value, ack) => change('hitDiceSize', value, ack)"
          />
        </v-col>
        <v-col
          v-if="model.attributeType === 'spellSlot'"
          cols="12"
        >
          <computed-field
            :label="$t('forms.attribute.spellSlotLevel')"
            :model="model.spellSlotLevel"
            :error-messages="errors.spellSlotLevel"
            @change="({path, value, ack}) =>
              $emit('change', {path: ['spellSlotLevel', ...path], value, ack})"
          />
        </v-col>
      </v-expand-transition>
    </v-row>
    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />
    <form-sections type="attribute">
      <v-expand-transition>
        <form-section
          v-if="model.attributeType === 'healthBar'"
          :name="$t('forms.attribute.healthBar')"
        >
          <div class="d-flex flex-column align-center mb-4">
            <div class="text-caption mb-4">
              {{ $t('forms.attribute.damagedColors') }}
            </div>
            <div
              class="d-flex flex-wrap align-center justify-start"
            >
              <outlined-input
                :name="$t('forms.attribute.half')"
                class="mb-4"
              >
                <color-picker
                  :value="model.healthBarColorMid"
                  :width="54"
                  :height="54"
                  @input="value => $emit('change', {path: ['healthBarColorMid'], value})"
                />
              </outlined-input>
              <outlined-input
                :name="$t('forms.attribute.empty')"
                class="mb-4 ml-2"
              >
                <color-picker
                  :value="model.healthBarColorLow"
                  :width="54"
                  :height="54"
                  @input="value => $emit('change', {path: ['healthBarColorLow'], value})"
                />
              </outlined-input>
            </div>
          </div>
          <v-row dense>
            <v-col
              cols="12"
              md="4"
            >
              <text-field
                :label="$t('forms.attribute.damageOrder')"
                type="number"
                :hint="$t('forms.attribute.damageOrderHint')"
                :disabled="model.healthBarNoDamage"
                :value="model.healthBarDamageOrder"
                :error-messages="errors.healthBarDamageOrder"
                @change="(value, ack) => change('healthBarDamageOrder', value, ack)"
              />
            </v-col>
            <v-col
              cols="12"
              md="4"
              sm="6"
            >
              <smart-switch
                :label="$t('forms.attribute.ignoreDamage')"
                :value="model.healthBarNoDamage"
                :error-messages="errors.healthBarNoDamage"
                @change="(value, ack) => change('healthBarNoDamage', value, ack)"
              />
            </v-col>
            <v-col
              cols="12"
              md="4"
              sm="6"
            >
              <smart-switch
                :label="$t('forms.attribute.preventDamageOverflow')"
                :value="model.healthBarNoDamageOverflow"
                :error-messages="errors.healthBarNoDamageOverflow"
                @change="(value, ack) => change('healthBarNoDamageOverflow', value, ack)"
              />
            </v-col>
            <v-col
              cols="12"
              md="4"
            >
              <text-field
                :label="$t('forms.attribute.healingOrder')"
                type="number"
                :hint="$t('forms.attribute.healingOrderHint')"
                :disabled="model.healthBarNoHealing"
                :value="model.healthBarHealingOrder"
                :error-messages="errors.healthBarHealingOrder"
                @change="(value, ack) => change('healthBarHealingOrder', value, ack)"
              />
            </v-col>
            <v-col
              cols="12"
              md="4"
              sm="6"
            >
              <smart-switch
                :label="$t('forms.attribute.ignoreHealing')"
                :value="model.healthBarNoHealing"
                :error-messages="errors.healthBarNoHealing"
                @change="(value, ack) => change('healthBarNoHealing', value, ack)"
              />
            </v-col>
            <v-col
              cols="12"
              md="4"
              sm="6"
            >
              <smart-switch
                :label="$t('forms.attribute.preventHealingOverflow')"
                :value="model.healthBarNoHealingOverflow"
                :error-messages="errors.healthBarNoHealingOverflow"
                @change="(value, ack) => change('healthBarNoHealingOverflow', value, ack)"
              />
            </v-col>
          </v-row>
        </form-section>
      </v-expand-transition>
      <form-section :name="$t('forms.attribute.damage')">
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <text-field
              :label="$t('forms.attribute.damage')"
              type="number"
              class="damage-field text-center"
              :hint="$t('forms.attribute.damageHint')"
              :disabled="!context.isLibraryForm"
              :value="model.damage"
              :error-messages="errors.damage"
              @change="(value, ack) => change('damage', value, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <reset-selector
              v-if="model.attributeType !== 'hitDice'"
              :hint="$t('forms.attribute.resetDamageHint')"
              :value="model.reset"
              :error-messages="errors.reset"
              @change="(value, ack) => change('reset', value, ack)"
            />
          </v-col>
        </v-row>
      </form-section>
      <form-section :name="$t('forms.behavior')"> 
        <v-row dense>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <smart-switch
              v-if="model.attributeType !== 'hitDice'"
              :label="$t('forms.attribute.allowDecimal')"
              class="mx-4"
              :value="model.decimal"
              :error-messages="errors.decimal"
              @change="(value, ack) => change('decimal', value, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <smart-switch
              :label="$t('forms.attribute.allowNegative')"
              class="mx-4"
              :value="model.ignoreLowerLimit"
              :error-messages="errors.ignoreLowerLimit"
              @change="(value, ack) => change('ignoreLowerLimit', value, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <smart-switch
              :label="$t('forms.attribute.allowAboveTotal')"
              class="mx-4"
              :value="model.ignoreUpperLimit"
              :error-messages="errors.ignoreUpperLimit"
              @change="(value, ack) => change('ignoreUpperLimit', value, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <smart-switch
              :label="$t('forms.attribute.hideWhenTotalZero')"
              class="mx-4"
              :value="model.hideWhenTotalZero"
              :error-messages="errors.hideWhenTotalZero"
              @change="(value, ack) => change('hideWhenTotalZero', value, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <smart-switch
              :label="$t('forms.attribute.hideWhenValueZero')"
              class="mx-4"
              :value="model.hideWhenValueZero"
              :error-messages="errors.hideWhenValueZero"
              @change="(value, ack) => change('hideWhenValueZero', value, ack)"
            />
          </v-col>
        </v-row>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { inject, watch } from 'vue';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import ColorPicker from '/imports/client/ui/components/ColorPicker.vue';
import ResetSelector from '/imports/client/ui/components/ResetSelector.vue';
import OutlinedInput from '/imports/client/ui/properties/viewers/shared/OutlinedInput.vue';
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

const emit = defineEmits(['change']);

const context = inject('context', {});

const attributeTypes = [
  {
    title: t('attributeTypes.ability'),
    value: 'ability',
    help: t('attributeTypes.abilityHelp'),
  }, {
    title: t('attributeTypes.stat'),
    value: 'stat',
    help: t('attributeTypes.statHelp'),
  }, {
    title: t('attributeTypes.modifier'),
    value: 'modifier',
    help: t('attributeTypes.modifierHelp'),
  }, {
    title: t('attributeTypes.hitDice'),
    value: 'hitDice',
  }, {
    title: t('attributeTypes.healthBar'),
    value: 'healthBar',
  }, {
    title: t('attributeTypes.resource'),
    value: 'resource',
    help: t('attributeTypes.resourceHelp')
  }, {
    title: t('attributeTypes.spellSlot'),
    value: 'spellSlot',
  }, {
    title: t('attributeTypes.utility'),
    value: 'utility',
    help: t('attributeTypes.utilityHelp'),
  },
];

const attributeTypeHints = Object.fromEntries(attributeTypes.map(type => [type.value, type.help]));

// Hit dice need a size; other types must not keep one
watch(() => props.model.attributeType, (newVal, oldVal) => {
  if (newVal === 'hitDice' && !props.model.hitDiceSize) {
    emit('change', { path: ['hitDiceSize'], value: 'd8' });
  } else if (oldVal === 'hitDice') {
    emit('change', { path: ['hitDiceSize'], value: undefined });
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
.no-flex {
  flex: initial;
}

.layout.row.wrap {
  margin-right: -8px;
}

.layout.row.wrap>* {
  margin-right: 8px;
}
</style>
