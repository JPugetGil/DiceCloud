<template>
  <div class="slot-form">
    <v-row dense>
      <v-col cols="12">
        <smart-select
          :label="$t('common.type')"
          clearable
          :hint="$t('forms.slot.typeHint')"
          :placeholder="$t('forms.slot.anyType')"
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
          :tag-hint="$t('forms.slot.tagHint')"
          :or-hint="$t('forms.slot.orHint')"
          :not-hint="$t('forms.slot.notHint')"
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
          :label="$t('forms.quantity')"
          :hint="$t('forms.slot.quantityHint')"
          :placeholder="$t('forms.slot.unlimited')"
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
          :label="$t('forms.condition')"
          :hint="$t('forms.slot.conditionHint')"
          :placeholder="$t('forms.alwaysActive')"
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
          :label="$t('forms.slot.unique')"
          style="flex-basis: 300px;"
          clearable
          :hint="$t('forms.slot.uniqueHint')"
          :placeholder="$t('forms.slot.allowDuplicates')"
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
          :name="$t('forms.slot.test')"
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
            {{ $t('forms.slot.testSlot') }}
          </v-btn>
        </outlined-input>
      </v-col>
    </v-row>
    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections type="slot">
      <form-section :name="$t('forms.behavior')">
        <v-row dense>
          <!--
          <v-col
            cols="12"
            md="6"
          >
            <smart-switch
              :label="$t('forms.slot.hideWhenFull')"
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
              :label="$t('forms.slot.ignored')"
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
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import TagTargeting from '/imports/client/ui/properties/forms/shared/TagTargeting.vue';
import OutlinedInput from '/imports/client/ui/properties/viewers/shared/OutlinedInput.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
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

const context = inject('context', {});
const dialogStackStore = useDialogStackStore();

const slotTypes = Object.keys(PROPERTIES).map(key => ({ title: getPropertyName(key), value: key }));

const uniqueOptions = [{
  title: t('forms.slot.uniqueInSlot'),
  value: 'uniqueInSlot',
}, {
  title: t('forms.slot.uniqueInCreature'),
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
