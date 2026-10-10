<template>
  <v-card
    class="action-card"
    :class="cardClasses"
    :data-id="model._id"
  >
    <div class="d-flex flex-1-1 align-center px-3">
      <div class="avatar">
        <v-btn
          icon
          variant="outlined"
          style="font-size: 16px; letter-spacing: normal;"
          class="mr-2"
          :data-id="`${model._id}-do-action-button`"
          :color="model.color || 'primary'"
          :loading="doActionLoading"
          :disabled="model.insufficientResources || !context.editPermission"
          @click.stop="handleDoAction"
        >
          <template v-if="rollBonus && !rollBonusTooLong">
            {{ rollBonus }}
          </template>
          <property-icon
            v-else
            :model="model"
          />
        </v-btn>
      </div>
      <div
        class="action-header flex-1-1 d-flex flex-column justify-center pl-1"
        style="height: 72px; cursor: pointer;"
        @mouseover="hovering = true"
        @mouseleave="hovering = false"
        @click="$emit('click')"
      >
        <div class="text-body-large text-truncate w-100 my-1">
          {{ model.name || propertyName }}
        </div>
        <div class="action-sub-title d-flex flex-1-1 align-center text-body-small text-medium-emphasis text-no-wrap overflow-hidden w-100">
          <div class="flex-1-1">
            {{ model.actionType }}
          </div>
          <div v-if="Number.isFinite(model.usesLeft)">
            {{ $t('cards.uses', { count: model.usesLeft }) }}
          </div>
        </div>
      </div>
    </div>
    <div class="px-3 pb-3">
      <template
        v-if="showResources"
      >
        <action-condition-view
          v-for="condition in model.resources?.conditions"
          :key="condition._id"
          class="action-child"
          :model="condition"
        />
        <attribute-consumed-view
          v-for="attributeConsumed in model.resources?.attributesConsumed"
          :key="attributeConsumed._id"
          class="action-child"
          :model="attributeConsumed"
        />
        <item-consumed-view
          v-for="itemConsumed in model.resources?.itemsConsumed"
          :key="itemConsumed._id"
          class="action-child"
          :model="itemConsumed"
          :action="model"
        />
        <v-divider
          v-if="model.summary"
          class="my-2"
        />
      </template>
      <template v-if="model.summary">
        <markdown-text :markdown="model.summary.value || model.summary.text" />
      </template>
      <v-divider v-if="children && children.length" />
      <tree-node-list
        v-if="children && children.length"
        start-expanded
        :children="children"
        :root="model.root"
        @selected="e => $emit('sub-click', e)"
      />
    </div>
    <card-highlight :active="hovering" />
  </v-card>
</template>

<script setup>
import { ref, computed, inject } from 'vue';
import { autorun } from 'vue-meteor-tracker';

import { getPropertyName } from '/imports/ui/i18n/propertyNames';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import doAction from '/imports/ui/creature/actions/doAction';
import ActionConditionView from '/imports/ui/properties/components/actions/ActionConditionView.vue';
import AttributeConsumedView from '/imports/ui/properties/components/actions/AttributeConsumedView.vue';
import ItemConsumedView from '/imports/ui/properties/components/actions/ItemConsumedView.vue';
import PropertyIcon from '/imports/ui/properties/shared/PropertyIcon.vue';
import MarkdownText from '/imports/ui/components/MarkdownText.vue';
import CardHighlight from '/imports/ui/components/CardHighlight.vue';
import TreeNodeList from '/imports/ui/components/tree/TreeNodeList.vue';
import { getFilter, docsToForest as nodeArrayToTree } from '/imports/api/parenting/parentingFunctions';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { some } from 'lodash';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['click', 'sub-click']);

const context = inject('context', {});


const activated = ref(undefined);
const doActionLoading = ref(false);
const hovering = ref(false);

const showResources = computed(() => {
  if (props.model.resources?.attributesConsumed?.length
    || props.model.resources?.itemsConsumed?.length) return true;
  return some(props.model.resources?.conditions, con => con.condition && !con.condition.value);
});

const rollBonus = computed(() => {
  if (!props.model.attackRoll) return;
  return numberToSignedString(props.model.attackRoll.value);
});

const rollBonusTooLong = computed(() => {
  return rollBonus.value && rollBonus.value.length > 3;
});

const propertyName = computed(() => {
  return getPropertyName(props.model.type);
});

const cardClasses = computed(() => {
  return {
    'text-disabled': props.model.insufficientResources,
    'active': activated.value,
    'elevation-3': hovering.value,
  }
});


const children = autorun(() => {
  const rangesToExclude = [];
  const descendants = CreatureProperties.find({
    ...getFilter.descendants(props.model),
    'removed': { $ne: true },
  }, {
    sort: {left: 1}
  }).map(prop => {
    // Get all the props we don't want to show the descendants of and
    // where they might appear in the ancestor list
    if (prop.type === 'buff' || prop.type === 'folder') {
      rangesToExclude.push({
        left: prop.left,
        right: prop.right,
      });
    }
    return prop;
  }).filter(prop => {
    // Filter out folders entirely
    if (prop.type === 'folder') return false;
    // Filter out descendants of terminating props
    return !some(rangesToExclude, range => {
      return prop.left > range.left && prop.right < range.right;
    });
  });
  return nodeArrayToTree(descendants);
}).result;


async function handleDoAction() {
  doActionLoading.value = true;
  await doAction({
    propId: props.model._id,
    creatureId: props.model.root.id,
    elementId: `${props.model._id}-do-action-button`,
    targetIds: [],
  }).catch((e) => {
    console.error(e);
  }).finally(() => {
    doActionLoading.value = false;
  });
}
</script>

<style lang="css" scoped>
.action-card {
  transition: box-shadow .4s cubic-bezier(0.25, 0.8, 0.25, 1),
    transform 0.075s ease;
}

.action-card.active {
  transform: scale(0.92);
}

.action-sub-title {
  height: 14px;
}

.action-child {
  height: 32px;
}
</style>
