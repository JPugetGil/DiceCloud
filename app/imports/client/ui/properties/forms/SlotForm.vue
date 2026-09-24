<template>
  <div class="slot-form">
    <v-row dense>
      <v-col cols="12">
        <smart-select
          label="Type"
          clearable
          hint="What property type is needed to fill this slot"
          placeholder="Any type"
          persistent-placeholder
          :items="slotTypes"
          :value="model.slotType"
          :error-messages="errors.slotType"
          @change="(value, ack) => change('slotType', value, ack)"
        />
      </v-col>
      <v-col cols="12">
        <tag-targeting
          :model="model"
          :errors="errors"
          tag-field="slotTags"
          tag-hint="Find library properties that have all of these tags"
          or-hint="Also library properties that have all of these tags instead"
          not-hint="Ignore library properties that have any of these tags"
          @change="e => $emit('change', e)"
          @push="e => $emit('push', e)"
          @pull="e => $emit('pull', e)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          label="Quantity"
          hint="How many matching properties must be used to fill this slot"
          placeholder="unlimited"
          persistent-placeholder
          :model="model.quantityExpected"
          :error-messages="errors.quantityExpected"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['quantityExpected', ...path], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          label="Condition"
          hint="A caclulation to determine if this slot should be active"
          placeholder="Always active"
          persistent-placeholder
          :model="model.slotCondition"
          :error-messages="errors.slotCondition"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['slotCondition', ...path], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-select
          v-if="model.type !== 'class'"
          label="Unique"
          style="flex-basis: 300px;"
          clearable
          hint="Do the properties that fill this slot need to be unique?"
          placeholder="Allow duplicate values"
          persistent-placeholder
          :items="uniqueOptions"
          :value="model.unique"
          :error-messages="errors.unique"
          @change="(value, ack) => change('unique', value, ack)"
        />
      </v-col>
      <v-col
        v-if="context.isLibraryForm"
        cols="12"
        md="6"
      >
        <outlined-input
          name="Test"
          data-id="test-slot-button"
        >
          <v-btn
            variant="text"
            class="ma-0"
            height="54"
            width="100%"
            style="justify-content: start;"
            @click="testSlot"
          >
            Test Slot
          </v-btn>
        </outlined-input>
      </v-col>
    </v-row>
    <inline-computation-field
      label="Description"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections type="slot">
      <form-section name="Behavior">
        <v-row dense>
          <!--
          <v-col
            cols="12"
            md="6"
          >
            <smart-switch
              label="Hide when full"
              style="width: 200px; flex-grow: 0;"
              class="mx-2"
              :value="model.hideWhenFull"
              :error-messages="errors.hideWhenFull"
              @change="(value, ack) => change('hideWhenFull', value, ack)"
            />
          </v-col>
          -->
          <v-col
            cols="12"
            md="6"
          >
            <smart-switch
              label="Ignored"
              style="width: 200px; flex-grow: 0;"
              class="mx-2"
              :value="model.ignored"
              :error-messages="errors.ignored"
              @change="(value, ack) => change('ignored', value, ack)"
            />
          </v-col>
        </v-row>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { inject } from 'vue';
import PROPERTIES from '/imports/constants/PROPERTIES';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import TagTargeting from '/imports/client/ui/properties/forms/shared/TagTargeting.vue';
import OutlinedInput from '/imports/client/ui/properties/viewers/shared/OutlinedInput.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

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

const context = inject('context', {});
const dialogStackStore = useDialogStackStore();

const slotTypes = Object.keys(PROPERTIES).map(key => ({ title: PROPERTIES[key].name, value: key }));

const uniqueOptions = [{
  title: 'Each property inside this slot should be unique',
  value: 'uniqueInSlot',
}, {
  title: 'Properties in this slot should be unique across the whole character',
  value: 'uniqueInCreature',
}];

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}

function testSlot() {
  if (!context.isLibraryForm) return;
  dialogStackStore.pushDialogStack({
    component: 'slot-fill-dialog',
    elementId: 'test-slot-button',
    data: {
      dummySlot: props.model,
    },
  });
}
</script>
