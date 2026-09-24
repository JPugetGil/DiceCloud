<template>
  <div class="item-form">
    <div class="d-flex flex-1-1 justify-space-around">
      <div>
        <smart-switch
          label="Equipped"
          :value="model.equipped"
          :error-messages="errors.equipped"
          @change="(value, ack) => change('equipped', value, ack)"
        />
      </div>
    </div>
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          label="Quantity"
          type="number"
          min="0"
          prepend-inner-icon="$abacus"
          :value="model.quantity"
          :error-messages="errors.quantity"
          @change="(value, ack) => change('quantity', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          label="Plural name"
          :value="model.plural"
          :error-messages="errors.plural"
          hint="The plural name of your item. If your item's name is 'sword' plural name would be 'swords'"
          @change="(value, ack) => change('plural', value, ack)"
        />
      </v-col>

      <v-col
        cols="12"
        md="6"
      >
        <text-field
          label="Value"
          suffix="gp"
          type="number"
          min="0"
          hint="The value of the item in gold pieces, using decimals for values less than 1 gp"
          prepend-inner-icon="$two_coins"
          :value="model.value"
          :error-messages="errors.value"
          @change="(value, ack) => change('value', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          label="Weight"
          suffix="lb"
          type="number"
          min="0"
          prepend-inner-icon="$weight"
          hint="The weight of a single item in lbs. Can be a decimal value"
          :value="model.weight"
          :error-messages="errors.weight"
          @change="(value, ack) => change('weight', value, ack)"
        />
      </v-col>
    </v-row>

    <inline-computation-field
      label="Description"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections type="item">
      <form-section
        name="Behavior"
      >
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <smart-switch
              label="Show increment button"
              :value="model.showIncrement"
              :error-messages="errors.showIncrement"
              @change="(value, ack) => change('showIncrement', value, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <smart-switch
              label="Don't show in log"
              :value="model.silent"
              :error-messages="errors.silent"
              @change="(value, ack) => change('silent', value, ack)"
            />
          </v-col>
        </v-row>
      </form-section>
      <form-section
        name="Attunement"
      >
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <smart-switch
              label="Requires attunement"
              :value="model.requiresAttunement"
              :error-messages="errors.requiresAttunement"
              @change="(value, ack) => change('requiresAttunement', value, ack)"
            />
          </v-col>
          <v-slide-x-transition>
            <v-col
              v-show="model.requiresAttunement"
              cols="12"
              md="6"
            >
              <smart-switch
                label="Attuned"
                :value="model.attuned"
                :error-messages="errors.attuned"
                @change="(value, ack) => change('attuned', value, ack)"
              />
            </v-col>
          </v-slide-x-transition>
        </v-row>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';

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

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>
