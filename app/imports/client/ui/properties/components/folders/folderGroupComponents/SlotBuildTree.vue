<template>
  <build-tree-node-list
    :children="slotBuildTree"
    class="mx-2"
    @selected="_id => $emit('sub-click', _id)"
  />
</template>

<script setup>
import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { getFilter, docsToForest } from '/imports/api/parenting/parentingFunctions';
import BuildTreeNodeList from '/imports/client/ui/creature/buildTree/BuildTreeNodeList.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['sub-click']);

function traverse(tree, callback, parents = []) {
  tree.forEach(node => {
    callback(node, parents);
    traverse(node.children, callback, [...parents, node]);
  });
}

const slotBuildTree = autorun(() => {
  const slots = CreatureProperties.find({
    $and: [ {
      $or: [
        { ...getFilter.descendants(props.model) },
        { '_id': props.model._id, },
      ],
    }, {
      $or:
        [
        { 'slotCondition.value': { $nin: [false, 0, ''] } },
        { 'slotCondition.value': { $exists: false } },
        { 'slotCondition': { $exists: false } },
        ],
    } ],
    type: { $in: ['propertySlot', 'pointBuy'] },
    removed: { $ne: true },
    inactive: { $ne: true },
  }, {
    sort: { left: 1 }
  });
  const slotIds = slots.map(s => s._id);
  const slotChildren = CreatureProperties.find({
    'parentId': { $in: slotIds },
    removed: { $ne: true },
  }, {
    sort: { left: 1 },
  });
  const tree = docsToForest([
    ...slots.fetch(),
    ...slotChildren.fetch()
  ]);
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
</script>