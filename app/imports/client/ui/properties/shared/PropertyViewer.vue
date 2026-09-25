<template>
  <div
    v-if="model && components[model.type]"
    class="property-viewer"
  >
    <v-row dense>
      <property-field
        v-if="model.inactive"
        :name="$t('viewers.status')"
        :cols="{cols: 12}"
      >
        <div
          style="width: 100%"
          class="text-disabled"
        >
          <div>
            {{ $t('viewers.inactive') }}
          </div>
          <div
            v-if="model.deactivatedByToggle && deactivatingToggle"
            class="pt-2"
          >
            <div>{{ $t('viewers.deactivatedBy') }}</div>
            <v-btn
              block
              :data-id="`tree-node-${model.deactivatingToggleId}`"
              style="text-transform: initial;"
              @click="selectSubProperty(model.deactivatingToggleId)"
            >
              <tree-node-view
                :model="deactivatingToggle"
              />
            </v-btn>
          </div>
          <div
            v-if="model.deactivatedByAncestor"
            class="pt-2"
          >
            {{ $t('viewers.deactivatedByAncestor') }}
          </div>
          <div
            v-if="model.deactivatedBySelf"
            class="pt-2"
          >
            {{ $t('viewers.deactivatedBySelf') }}
          </div>
        </div>
      </property-field>
    </v-row>
    <component
      :is="components[model.type]"
      :key="model._id"
      class="property-viewer"
      :model="model"
      @select-sub-property="id => selectSubProperty(id)"
      @change="e => $emit('change', e)"
      @remove="$emit('remove')"
    />
    <v-row dense>
      <template
        v-if="collection == 'libraryNodes'"
      >
        <property-field
          v-if="model.fillSlots || model.searchable"
          :name="$t('viewers.libraryBehavior')"
        >
          <ul>
            <li
              v-if="model.fillSlots"
            >
              {{ $t('forms.property.canFillSlots') }}
            </li>
            <li v-if="model.searchable">
              {{ $t('forms.property.searchable') }}
            </li>
          </ul>
        </property-field>
        <property-field
          :name="$t('forms.property.slotFillType')"
          :value="slotFillTypeName"
        />
        <property-field
          :name="$t('forms.property.slotQuantity')"
          :value="model.slotQuantityFilled"
        />
        <property-field
          :name="$t('forms.condition')"
          mono
          :value="model.slotFillerCondition"
        />
        <property-field
          :name="$t('forms.property.conditionErrorText')"
          :value="model.slotFillerConditionNote"
        />
        <property-field
          :name="$t('forms.property.libraryTags')"
          :cols="{cols: 12}"
        >
          <div
            v-if="model.libraryTags && model.libraryTags.length"
            class="py-2"
          >
            <v-chip
              v-for="(tag, index) in model.libraryTags"
              :key="tag + index"
              class="mr-1"
              size="small"
              disabled
            >
              {{ tag }}
            </v-chip>
          </div>
        </property-field>
      </template>
      <property-field
        :name="$t('forms.tags')"
        :cols="{cols: 12}"
      >
        <div
          v-if="model.tags && model.tags.length"
          class="py-1"
        >
          <v-chip
            v-for="(tag, index) in model.tags"
            :key="tag + index"
            class="mr-1"
            disabled
            size="small"
          >
            {{ tag }}
          </v-chip>
        </div>
      </property-field>
      <property-field
        v-show="childrenLength"
        :name="$t('forms.property.childProperties')"
        :cols="{cols: 12}"
      >
        <descendant-properties-tree
          style="width: 100%;"
          :model="model"
          :collection="collection"
          @length="childrenLength = $event"
          @selected="selectSubProperty"
        />
      </property-field>
    </v-row>
  </div>
  <div v-else-if="model">
    {{ $t('viewers.cantView') }}
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import propertyViewerIndex from '/imports/client/ui/properties/viewers/shared/propertyViewerIndex';
import CreaturePropertiesTree from '/imports/client/ui/creature/creatureProperties/CreaturePropertiesTree.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import DescendantPropertiesTree from '/imports/client/ui/creature/creatureProperties/DescendantPropertiesTree.vue';
import TreeNodeView from '/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue';

const components = {
  ...propertyViewerIndex,
  CreaturePropertiesTree,
  PropertyField,
  DescendantPropertiesTree,
};

const props = defineProps({
  model: {
    type: Object,
    default: undefined
  },
  collection: {
    type: String,
    default: 'creatureProperties'
  },
});

const emit = defineEmits(['change', 'remove', 'select-sub-property']);

const childrenLength = ref(0);

const deactivatingToggle = autorun(() => {
  if (!props.model?.deactivatingToggleId) return;
  return CreatureProperties.findOne(props.model.deactivatingToggleId);
}).result;

const slotFillTypeName = computed(() => {
  return getPropertyName(props.model?.slotFillerType);
});

function selectSubProperty(_id) {
  emit('select-sub-property', _id);
}
</script>

<style lang="css">
.property-viewer ol, .property-viewer ul {
  padding-left: 36px;
}
</style>
