<template>
  <v-container fluid>
    <v-row dense>
      <v-col cols="12">
        <character-errors
          class="mt-4"
          :creature-id="creatureId"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <slot-cards-to-fill :creature-id="creatureId" />
    </v-row>
    <v-row dense>
      <v-col
        v-for="folder in startFolders"
        :key="folder._id"
        v-bind="cols"
      >
        <folder-group-card
          :model="folder"
          @click-property="clickProperty"
          @sub-click="_id => clickTreeProperty({_id})"
          @remove="softRemove"
        />
      </v-col>
      <v-col
        v-bind="cols"
      >
        <v-card class="pb-4">
          <v-card-title style="height: 68px;">
            {{ $t('build.slots') }}
            <v-spacer />
            <v-menu
              location="bottom left"
              transition="slide-y-transition"
            >
              <template #activator="{ props: activatorProps }">
                <v-scale-transition>
                  <v-badge
                    v-show="hiddenCount"
                    color="primary"
                    :model-value="!!hiddenCount"
                    :content="hiddenCount"
                  >
                    <v-btn
                      variant="text"
                      icon
                      v-bind="activatorProps"
                    >
                      <v-icon>mdi-file-hidden</v-icon>
                    </v-btn>
                  </v-badge>
                </v-scale-transition>
              </template>
              <v-list>
                <v-list-subheader>
                  <v-icon class="mr-2">
                    mdi-file-hidden
                  </v-icon>
                  {{ $t('build.hiddenProperties', { count: hiddenCount }, hiddenCount) }}
                </v-list-subheader>
                <v-list-item
                  v-for="pointBuy in hiddenPointBuys"
                  :key="pointBuy._id"
                  @click="unhideProp(pointBuy._id)"
                >
                  <v-list-item-title>
                    {{ getPropertyTitle(pointBuy) }}
                  </v-list-item-title>
                </v-list-item>
                <v-list-item
                  v-for="slot in hiddenSlots"
                  :key="slot._id"
                  @click="unhideProp(slot._id)"
                >
                  <v-list-item-title>
                    {{ getPropertyTitle(slot) }}
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </v-card-title>
          <build-tree-node-list
            :children="slotBuildTree"
            class="mx-2"
            @selected="_id => propertyClicked({_id, prefix: 'tree-node-'})"
          />
        </v-card>
      </v-col>
      <v-col
        v-bind="cols"
      >
        <v-card class="class-details mb-2">
          <v-card-title
            v-if="variables.level"
            class="text-h6"
          >
            {{ $t('build.level', { level: variables.level.value }) }}
          </v-card-title>
          <v-list lines="two">
            <v-list-item>
              <v-list-item-title
                v-if="
                  variables.milestoneLevels &&
                    variables.milestoneLevels.value
                "
              >
                {{ $t('build.milestoneLevels', { count: variables.milestoneLevels.value }) }}
              </v-list-item-title>
              <v-list-item-title
                v-if="
                  !(variables.milestoneLevels &&
                    variables.milestoneLevels.value) ||
                    (variables.xp &&
                      variables.xp.value)
                "
              >
                {{ $t('build.xp', { xp: variables.xp && variables.xp.value || 0 }) }}
              </v-list-item-title>

              <template #append>
                <v-btn
                  variant="text"
                  icon
                  data-id="experience-info-button"
                  @click="showExperienceList"
                >
                  <v-icon>mdi-information-outline</v-icon>
                </v-btn>
              
                <v-btn
                  variant="text"
                  icon
                  data-id="experience-add-button"
                  @click="addExperience"
                >
                  <v-icon>mdi-plus</v-icon>
                </v-btn>
              </template>
            </v-list-item>
            <v-list-item
              v-for="cls in classes"
              :key="cls._id"
              :data-id="`class-${cls._id}`"
              v-on="cls.type === 'class' ? {click: () => propertyClicked({_id: cls._id, prefix: 'class-'})} : {}"
            >
              <v-list-item-title>
                {{ cls.name }}
              </v-list-item-title>

              <template #append>
                <v-avatar>
                  {{ cls.level }}
                </v-avatar>
              
                <v-btn
                  v-if="cls.type === 'class'"
                  variant="outlined"
                  color="accent"
                  data-id="level-up-btn"
                  :disabled="cls.slotCondition && cls.slotCondition.hasOwnProperty('value') && !cls.slotCondition.value"
                  @click.stop="levelUpDialog(cls._id)"
                >
                  <v-icon start>
                    mdi-plus
                  </v-icon>
                  <template v-if="cls.missingLevels && cls.missingLevels.length">
                    {{ $t('build.getMissingLevels') }}
                  </template>
                  <template v-else>
                    {{ $t('build.levelUp') }}
                  </template>
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
      <v-col
        v-for="folder in endFolders"
        :key="folder._id"
        v-bind="cols"
      >
        <folder-group-card
          :model="folder"
          @click-property="clickProperty"
          @sub-click="_id => clickTreeProperty({_id})"
          @remove="softRemove"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { docsToForest, getFilter } from '/imports/api/parenting/parentingFunctions';
import BuildTreeNodeList from '/imports/client/ui/creature/buildTree/BuildTreeNodeList.vue';
import SlotCardsToFill from '/imports/client/ui/creature/slots/SlotCardsToFill.vue';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import CharacterErrors from '/imports/client/ui/creature/character/errors/CharacterErrors.vue';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import getPropertyTitle from '/imports/client/ui/properties/shared/getPropertyTitle';
import FolderGroupCard from '/imports/client/ui/properties/components/folders/FolderGroupCard.vue';
import softRemoveProperty from '/imports/api/creature/creatureProperties/methods/softRemoveProperty';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

function traverse(tree, callback, parents = []) {
  tree.forEach(node => {
    callback(node, parents);
    traverse(node.children, callback, [...parents, node]);
  });
}

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});


const tabName = ref('build');
const cols = {
  cols: '12',
  md: '6',
  xl: '4',
};

// Folders from mixin
const startFolders = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  groupStats: true,
  inactive: { $ne: true },
  removed: { $ne: true },
  tab: tabName.value,
  location: 'start',
}, {
  sort: { left: 1 }
}).fetch()).result;

const endFolders = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  groupStats: true,
  inactive: { $ne: true },
  removed: { $ne: true },
  tab: tabName.value,
  location: 'end',
}, {
  sort: { left: 1 }
}).fetch()).result;

function clickProperty({ _id }) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${_id}`,
    data: { _id },
  });
}

function clickTreeProperty({ _id }) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `tree-node-${_id}`,
    data: { _id },
  });
}

async function softRemove(_id) {
  try {
    await softRemoveProperty.callAsync({ _id });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  }
}

// BuildTab specific

const variables = autorun(() => CreatureVariables.findOne({ _creatureId: props.creatureId }) || {}).result;

const hiddenPointBuys = autorun(() => CreatureProperties.find({
  type: 'pointBuy',
  ...getFilter.descendantsOfRoot(props.creatureId),
  ignored: true,
  pointsLeft: { $ne: 0 },
  removed: { $ne: true },
  inactive: { $ne: true },
}).fetch()).result;

const hiddenSlots = autorun(() => CreatureProperties.find({
  type: 'propertySlot',
  ...getFilter.descendantsOfRoot(props.creatureId),
  ignored: true,
  $and: [
    {
      $or: [
        { 'slotCondition.value': { $nin: [false, 0, ''] } },
        { 'slotCondition.value': { $exists: false } },
      ]
    }, {
      $or: [
        { 'quantityExpected.value': { $in: [false, 0, '', undefined] } },
        { 'quantityExpected.value': { exists: false } },
        { spaceLeft: { $gt: 0 } },
      ]
    },
  ],
  removed: { $ne: true },
  inactive: { $ne: true },
}).fetch()).result;

const classProperties = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  type: 'class',
  removed: { $ne: true },
  inactive: { $ne: true },
}, {
  sort: { left: 1 }
}).fetch()).result;

const classLevels = autorun(() => {
  const classVariableNames = (classProperties.value || []).map(c => c.variableName);
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    type: 'classLevel',
    variableName: { $nin: classVariableNames },
    removed: { $ne: true },
    inactive: { $ne: true },
  }, {
    sort: { left: 1 }
  }).fetch();
}).result;

const slotBuildTree = autorun(() => {
  const slots = CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    type: { $in: ['propertySlot', 'pointBuy'] },
    $or: [
      { 'slotCondition.value': { $nin: [false, 0, ''] } },
      { 'slotCondition.value': { $exists: false } },
      { 'slotCondition': { $exists: false } },
    ],
    removed: { $ne: true },
    inactive: { $ne: true },
  });
  const slotIds = slots.map(s => s._id);
  const slotChildren = CreatureProperties.find({
    'parentId': { $in: slotIds },
    removed: { $ne: true },
  });
  const tree = docsToForest([
    ...slots.fetch(),
    ...slotChildren.fetch()
  ].sort((a, b) => a.left - b.left));
  traverse(tree, (child, parents) => {
    const model = child.doc;
    const isSlotWithSpace = model.type === 'propertySlot' && (
      model.spaceLeft > 0 ||
      !model.quantityExpected ||
      model.quantityExpected.value === 0
    );
    if (isSlotWithSpace) {
      model._canFill = true;
      parents.forEach(node => {
        node.doc._descendantCanFill = true;
      });
    }
  });
  return tree;
}).result;

const highestLevels = computed(() => {
  let highestLevelsMap = {};
  let highestLevelsList = [];
  const levels = classLevels.value || [];
  levels.forEach(classLevel => {
    let name = classLevel.variableName;
    if (
      !highestLevelsMap[name] ||
      highestLevelsMap[name].level < classLevel.level
    ) {
      highestLevelsMap[name] = classLevel;
    }
  });
  for (let name in highestLevelsMap) {
    highestLevelsList.push(highestLevelsMap[name]);
  }
  highestLevelsList.sort((a, b) => a.level - b.level);
  return highestLevelsList;
});

const classes = computed(() => {
  return [
    ...(highestLevels.value || []),
    ...(classProperties.value || [])
  ].sort((a, b) => a.order - b.order);
});

const hiddenCount = computed(() => {
  return (hiddenSlots.value?.length || 0) + (hiddenPointBuys.value?.length || 0);
});

function propertyClicked({ _id, prefix }) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${prefix}${_id}`,
    data: { _id },
  });
}

function addExperience() {
  dialogStackStore.pushDialogStack({
    component: 'experience-insert-dialog',
    elementId: 'experience-add-button',
    data: {
      creatureIds: [props.creatureId],
      startAsMilestone: variables.value?.milestoneLevels &&
        !!variables.value.milestoneLevels.value,
    },
  });
}

function showExperienceList() {
  dialogStackStore.pushDialogStack({
    component: 'experience-list-dialog',
    elementId: 'experience-info-button',
    data: {
      creatureId: props.creatureId,
      startAsMilestone: variables.value?.milestoneLevels &&
        !!variables.value.milestoneLevels.value,
    },
  });
}


function levelUpDialog(classId) {
  dialogStackStore.pushDialogStack({
    component: 'level-up-dialog',
    elementId: 'level-up-btn',
    data: {
      creatureId: props.creatureId,
      classId,
    },
    async callback(nodeIds) {
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

async function unhideProp(_id) {
  try {
    await updateCreatureProperty.callAsync({
      _id,
      path: ['ignored'],
      value: false,
    });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  }
}
</script>

<style lang="css" scoped>
</style>
