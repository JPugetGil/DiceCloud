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
          :disabled="model.insufficientResources || !context.editPermission || !!targetingError"
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
        <div class="action-title my-1">
          {{ model.name || propertyName }}
        </div>
        <div class="action-sub-title d-flex flex-1-1 align-center">
          <div
            v-if="targetingError"
            class="flex-1-1 text-error"
          >
            {{ targetingError }}
          </div>
          <template v-else>
            <div class="flex-1-1">
              {{ model.actionType }}
            </div>
            <div v-if="Number.isFinite(model.usesLeft)">
              {{ $t('cards.uses', { count: model.usesLeft }) }}
            </div>
          </template>
        </div>
      </div>
    </div>
    <div class="px-3 pb-3">
      <template
        v-if="showResources"
      >
        <action-condition-view
          v-for="condition in model.resources.conditions"
          :key="condition._id"
          class="action-child"
          :model="condition"
        />
        <attribute-consumed-view
          v-for="attributeConsumed in model.resources.attributesConsumed"
          :key="attributeConsumed._id"
          class="action-child"
          :model="attributeConsumed"
        />
        <item-consumed-view
          v-for="itemConsumed in model.resources.itemsConsumed"
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

import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import doAction from '/imports/client/ui/creature/actions/doAction';
import ActionConditionView from '/imports/client/ui/properties/components/actions/ActionConditionView.vue';
import AttributeConsumedView from '/imports/client/ui/properties/components/actions/AttributeConsumedView.vue';
import ItemConsumedView from '/imports/client/ui/properties/components/actions/ItemConsumedView.vue';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import CardHighlight from '/imports/client/ui/components/CardHighlight.vue';
import TreeNodeList from '/imports/client/ui/components/tree/TreeNodeList.vue';
import { getFilter, docsToForest as nodeArrayToTree } from '/imports/api/parenting/parentingFunctions';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { some } from 'lodash';
import useThemeState from '/imports/client/ui/utility/useThemeState';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  targets: {
    type: Array,
    default: undefined,
  },
});

defineEmits(['click', 'sub-click']);

const context = inject('context', {});
const theme = useThemeState();


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
    'v-theme--dark': theme.isDark,
    'v-theme--light': !theme.isDark,
    'muted-text': props.model.insufficientResources,
    'active': activated.value,
    'elevation-8': hovering.value,
  }
});


const targetingError = computed(() => {
  // Can always do an action without a target
  if (!props.targets || !props.targets.length) return undefined;
  if (props.targets.length > 1 && props.model.target !== 'multipleTargets'){
    return t('targets.singleTarget');
  } else if (props.model.target === 'self' && props.targets[0] !== props.model.ancestors[0]._id){
    return t('targets.canOnlyTargetSelf');
  }
  return undefined;
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

.action-title {
  font-size: 16px;
  font-weight: 400;
  height: 24px;
  line-height: 24px;
  position: relative;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: .3s cubic-bezier(.25, .8, .5, 1);
  width: 100%;
}

.action-sub-title {
  /* Material's medium emphasis; the fixed #9e9e9e was 2.7:1 on white */
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  flex-grow: 0;
  font-size: 12px;
  line-height: 12px;
  height: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.action-child {
  height: 32px;
}

.v-theme--light.muted-text {
  color: rgba(0, 0, 0, .3) !important;
}

.v-theme--dark.muted-text {
  color: hsla(0, 0%, 100%, .3) !important;
}

.action-card {
  transition: transform 0.15s cubic;
}
</style>

<style lang="css">
.action-card.v-theme--light.muted-text .v-icon {
  color: rgba(0, 0, 0, .3) !important;
}

.action-card.v-theme--dark.muted-text .v-icon {
  color: hsla(0, 0%, 100%, .3) !important;
}

.action-card .property-description>p:last-of-type {
  margin-bottom: 0;
}
</style>
