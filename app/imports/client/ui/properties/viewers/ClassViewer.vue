<template>
  <div class="class-viewer">
    <v-row dense>
      <property-field
        name="Variable Name"
        mono
        :value="model.variableName"
      />
      <property-field
        name="Condition"
        :value="model.slotCondition && (model.slotCondition.value || model.slotCondition.calculation)"
      />
      <property-field
        v-if="(model.slotTags && model.slotTags.length) || (model.extraTags && model.extraTags.length)"
        name="Tags Required"
        :cols="{cols: 12}"
      >
        <div>
          <property-tags :tags="model.slotTags" />
          <div
            v-for="tags in model.extraTags"
            :key="tags._id"
          >
            <div class="text-caption">
              {{ tags.operation }}
            </div>
            <property-tags :tags="tags.tags" />
          </div>
        </div>
      </property-field>
      <property-field
        name="Missing Levels"
        mono
        :value="model.missingLevels &&
          (model.missingLevels.length || undefined) &&
          model.missingLevels.join(', ')
        "
      />
      <property-field
        v-if="context.creatureId"
        name="Level"
        :value="model.level"
      />
      <property-field
        v-if="context.creatureId"
        name="Level Up"
        :cols="{cols: 12}"
      >
        <v-btn
          variant="outlined"
          color="accent"
          data-id="level-up-btn"
          :disabled="model.slotCondition && model.slotCondition.hasOwnProperty('value') && !model.slotCondition.value"
          @click="levelUpDialog"
        >
          <v-icon start>
            mdi-plus
          </v-icon>
          <template v-if="model.missingLevels && model.missingLevels.length">
            Get Missing Levels
          </template>
          <template v-else>
            Level Up
          </template>
        </v-btn>
      </property-field>
      <property-description
        name="Description"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import { inject} from 'vue';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';
import PropertyTags from '/imports/client/ui/properties/viewers/shared/PropertyTags.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});

const dialogStackStore = useDialogStackStore();

function levelUpDialog() {
  let classId = props.model._id;
  dialogStackStore.pushDialogStack({
    component: 'level-up-dialog',
    elementId: 'level-up-btn',
    data: {
      creatureId: context.creatureId,
      classId: props.model._id,
    },
    async callback(nodeIds){
      if (!nodeIds || !nodeIds.length) return;
      let newPropertyId = await insertPropertyFromLibraryNode.callAsync({
        nodeIds,
        parentRef: {
          'id': classId,
          'collection': 'creatureProperties',
        },
      });
      return `tree-node-${newPropertyId}`;
    }
  });
}
</script>

<style lang="css" scoped>
</style>
