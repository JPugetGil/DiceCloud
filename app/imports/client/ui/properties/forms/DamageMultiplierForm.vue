<template>
  <div class="damage-multiplier-form">
    <v-row dense>
      <v-col
        cols="12"
      >
        <smart-toggle
          label="Multiplier"
          :value="model.value"
          :options="[{
            value: 2,
            name: 'Vulnerability',
          },{
            value: 0.5,
            name: 'Resistance',
          }, {
            value: 0,
            name: 'Immunity',
          }]"
          :error-messages="errors.value"
          @change="(value, ack) => change('value', value, ack)"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col cols="12">
        <smart-combobox
          label="Damage Types"
          multiple
          chips
          deletable-chips
          :rules="damageTypeRules"
          :items="DAMAGE_TYPES"
          :value="model.damageTypes"
          :error-messages="errors.damageTypes"
          :menu-props="{auto: true, lazy: true}"
          @update:error="error"
          @change="(value, ack) => change('damageTypes', value, ack)"
        />
      </v-col>
    </v-row>
    <form-sections type="damageMultiplier">
      <form-section
        v-if="$slots.children"
        name="Children"
      >
        <slot name="children" />
      </form-section>
      <form-section name="Apply by tag">
        <v-row dense>
          <v-col cols="12">
            <smart-combobox
              label="Tags required"
              hint="Only apply to damage that has all of these tags"
              multiple
              small-chips
              deletable-chips
              persistent-hint
              :items="['magical', 'silvered']"
              :value="model.includeTags"
              @change="(value, ack) => change('includeTags', value, ack)"
            />
          </v-col>
          <v-col cols="12">
            <smart-combobox
              label="Tags excluded"
              hint="Don't apply to damage that has any of these tags"
              multiple
              small-chips
              deletable-chips
              persistent-hint
              :items="['magical', 'silvered']"
              :value="model.excludeTags"
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
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import VARIABLE_NAME_REGEX from '/imports/constants/VARIABLE_NAME_REGEX';
import DAMAGE_TYPES from '/imports/constants/DAMAGE_TYPES';

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

const emit = defineEmits(['change']);

const damageTypeRules = [
  value => {
    if (value && value.length) {
      for (let i = 0; i < value.length; i++) {
        if (!VARIABLE_NAME_REGEX.test(value[i])) {
          return `${value[i]} is not a valid damage name`
        }
      }
    }
  }
];

// The damage type field's `update:error` handler
function error(e) {
  console.error(e);
}

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
