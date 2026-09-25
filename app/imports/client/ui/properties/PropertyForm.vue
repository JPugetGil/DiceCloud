<template>
  <div class="property-form">
    <v-row>
      <v-col
        cols="12"
        class="d-flex flex-wrap-reverse justify-end"
        style="gap: 8px"
      >
        <text-field
          v-if="schemaHasName"
          ref="focusFirst"
          :label="$t('common.name')"
          style="flex-basis: 320px;"
          :value="model.name"
          :error-messages="errors.name"
          @change="(value, ack) => $emit('change', {path: ['name'], value, ack})"
        />
        <icon-color-menu
          :model="model"
          @change="e => $emit('change', e)"
        />
      </v-col>
    </v-row>
    <component
      :is="propertyFormIndex[model?.type] || model?.type"
      class="creature-property-form mb-4"
      :model="model"
      :errors="errors"
      @change="e => $emit('change', e)"
      @push="e => $emit('push', e)"
      @pull="e => $emit('pull', e)"
    >
      <form-section
        v-if="context.isLibraryForm"
        :name="$t('forms.property.library')"
      >
        <v-row
          v-if="context.isLibraryForm"
          dense
        >
          <v-col
            cols="12"
            md="6"
          >
            <smart-switch
              :label="$t('forms.property.canFillSlots')"
              :value="model.fillSlots"
              :error-messages="errors.fillSlots"
              @change="(value, ack) => $emit('change', {path: ['fillSlots'], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <smart-switch
              :label="$t('forms.property.searchable')"
              :value="model.searchable"
              :error-messages="errors.searchable"
              @change="(value, ack) => $emit('change', {path: ['searchable'], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <smart-select
              :label="$t('forms.property.slotFillType')"
              style="flex-basis: 300px;"
              clearable
              :hint="$t('forms.property.slotFillTypeHint')"
              :items="slotTypes"
              :value="model.slotFillerType"
              :error-messages="errors.slotFillerType"
              @change="(value, ack) => $emit('change', {path: ['slotFillerType'], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <text-field
              :label="$t('forms.property.slotQuantity')"
              type="number"
              min="0"
              :hint="$t('forms.property.slotQuantityHint')"
              :value="model.slotQuantityFilled"
              :error-messages="errors.slotQuantityFilled"
              @change="(value, ack) => $emit('change', {path: ['slotQuantityFilled'], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <text-field
              v-if="context.isLibraryForm"
              :label="$t('forms.condition')"
              :hint="$t('forms.property.conditionHint')"
              :placeholder="$t('forms.alwaysActive')"
              :value="model.slotFillerCondition"
              :error-messages="errors.slotFillerCondition"
              @change="(value, ack) => $emit('change', {path: ['slotFillerCondition'], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <text-field
              v-if="context.isLibraryForm"
              :label="$t('forms.property.conditionErrorText')"
              :hint="$t('forms.property.conditionErrorTextHint')"
              :placeholder="$t('forms.alwaysActive')"
              :value="model.slotFillerConditionNote"
              :error-messages="errors.slotFillerConditionNote"
              @change="(value, ack) => $emit('change', {path: ['slotFillerConditionNote'], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
          >
            <smart-combobox
              :label="$t('forms.property.libraryTags')"
              multiple
              small-chips
              deletable-chips
              :hint="$t('forms.property.libraryTagsHint')"
              :value="model.libraryTags"
              :error-messages="errors.libraryTags"
              @change="(value, ack) => $emit('change', {path: ['libraryTags'], value, ack})"
            />
          </v-col>
        </v-row>
      </form-section>
    </component>
    <v-divider
      class="mt-10 mb-8"
    />
    <v-row>
      <v-col
        cols="12"
      >
        <smart-combobox
          :label="$t('forms.tags')"
          multiple
          small-chips
          deletable-chips
          :hint="$t('forms.property.tagsHint')"
          :value="model.tags"
          :error-messages="errors.tags"
          @change="(value, ack) => $emit('change', {path: ['tags'], value, ack})"
        />
      </v-col>
    </v-row>
    <v-row
      class="mt-1"
      dense
    >
      <v-col
        cols="12"
        class="d-flex flex-wrap-reverse justify-end"
        style="gap: 8px"
      >
        <outlined-input
          :name="$t('forms.property.childProperties')"
          style="width: 100%"
          class="pa-2 no-hover"
        >
          <descendant-properties-tree
            style="width: 100%;"
            organize
            :model="model"
            :root="model.root"
            :collection="collection"
            @selected="e => $emit('select-sub-property', e)"
          />
          <v-btn
            v-for="suggestion in suggestedChildren"
            :key="suggestion.type"
            :disabled="noChildInsert"
            tile
            variant="plain"
            :data-id="`insert-${suggestion.type}-property-btn`"
            @click="$event => $emit('add-child', {suggestedType: suggestion.type, elementId: `insert-${suggestion.type}-property-btn`})"
          >
            <v-icon start>
              mdi-plus
            </v-icon>
            {{ getPropertyName(suggestion.type) }}
          </v-btn>
          <v-btn
            :disabled="noChildInsert || context.editPermission === false"
            tile
            variant="plain"
            data-id="insert-any-property-btn"
            @click="$event => $emit('add-child', {elementId: 'insert-any-property-btn'})"
          >
            <v-icon
              v-if="!suggestedChildren.length"
              start
            >
              mdi-plus
            </v-icon>
            {{ suggestedChildren.length ? $t('forms.property.otherChild') : $t('forms.property.child') }}
          </v-btn>
          <div
            v-if="noChildInsert"
            class="ma-2 text-disabled"
          >
            {{ $t('forms.property.childrenAfterCreate') }}
          </div>
        </outlined-input>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
/*
  All of the shared fields common to all properties go in this form,
  property-specific forms are included as dynamic components
*/
import { ref, computed, inject } from 'vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import propertyFormIndex from '/imports/client/ui/properties/forms/shared/propertyFormIndex';
import IconColorMenu from '/imports/client/ui/properties/forms/shared/IconColorMenu.vue';
import DescendantPropertiesTree from '/imports/client/ui/creature/creatureProperties/DescendantPropertiesTree.vue';
import OutlinedInput from '/imports/client/ui/properties/viewers/shared/OutlinedInput.vue';
import { getSuggestedChildren } from '/imports/constants/PROPERTIES';
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import PROPERTIES from '/imports/constants/PROPERTIES';
import propertySchemasIndex from '/imports/api/properties/computedPropertySchemasIndex';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  collection: {
    type: String,
    default: 'creatureProperties',
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
  embedded: Boolean, // This dialog is embedded in a page
  noChildInsert: Boolean, // Don't allow inserting of children in this form
});

defineEmits(['change', 'push', 'pull', 'select-sub-property', 'add-child']);

const context = inject('context', {});

const slotTypes = [];
for (let key in PROPERTIES) {
  slotTypes.push({ title: getPropertyName(key), value: key });
}

const suggestedChildren = computed(() => {
  if (!props.model?.type) return [];
  return getSuggestedChildren(props.model.type);
});

const schemaHasName = computed(() => {
  if (!props.model?.type) return true;
  const schema = propertySchemasIndex[props.model.type];
  return schema ? schema.allowsKey('name') : true;
});

const focusFirst = ref(null);

/** Disable auto-focus, it gets in the way more than it helps
// Don't autofocus on mobile, it brings up the on-screen keyboard
if (this.$vuetify.display.smAndDown) return;

setTimeout(() => {
  if (this.$refs.focusFirst && this.$refs.focusFirst.focus) {
    this.$refs.focusFirst.focus()
  }
}, 300);
*/

function selectSubProperty(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `tree-node-${_id}`,
    data: {
      _id,
      startInEditTab: undefined,
    },
  });
}

defineExpose({
  selectSubProperty,
});
</script>
