<template>
  <div
    class="action-card"
    :class="cardClasses"
  >
    <div class="d-flex align-center mb-2">
      <div class="action-title text-center flex-grow-1">
        {{ model.name || propertyName }}
      </div>
      <div class="avatar">
        <property-icon
          :model="model"
          color="rgba(0,0,0,0.7)"
        />
      </div>
    </div>
    <div
      v-if="Number.isFinite(model.uses)"
      class="action-sub-title d-flex align-center"
    >
      {{ $t('printed.uses', { uses: model.uses }) }}
    </div>
    <div>
      <div
        v-if="model.resources && model.resources.attributesConsumed.length ||
          model.resources.itemsConsumed.length"
        class="resources my-2"
      >
        <div
          v-for="attributeConsumed in model.resources.attributesConsumed"
          :key="attributeConsumed._id"
          class="d-flex flex-1-1 align-center justify-start"
        >
          {{ $t('printed.cost', { quantity: attributeConsumed.quantity && attributeConsumed.quantity.value, stat: attributeConsumed.statName || attributeConsumed.variableName }) }}
        </div>
        <div
          v-for="itemConsumed in model.resources.itemsConsumed"
          :key="itemConsumed._id"
        >
          <template v-if="itemConsumed.itemName">
            {{ $t('printed.usesItem', { quantity: itemConsumed.quantity && itemConsumed.quantity.value || 0, item: itemConsumed.itemName || itemConsumed.tag }) }}
          </template>
        </div>
      </div>
      <template v-if="model.summary">
        <markdown-text :markdown="model.summary.value || model.summary.text" />
      </template>
      <div
        v-if="rollBonus"
        class="roll-bonus"
      >
        <span class="to-hit ml-2">
          {{ rollBonus }}
        </span>
        <span>
          {{ $t('printed.toHit') }}
        </span>
      </div>
      <tree-node-list
        v-if="children && children.length"
        start-expanded
        :children="children"
        :root="{id: model._id, collection: 'creatureProperties'}"
        @selected="e => $emit('sub-click', e)"
      />
    </div>
    <div class="action-subtitle text-center">
      {{ actionTypeName }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed} from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import { translateOr } from '/imports/client/ui/i18n';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import TreeNodeList from '/imports/client/ui/components/tree/TreeNodeList.vue';
import { getFilter, docsToForest } from '/imports/api/parenting/parentingFunctions';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { some } from 'lodash';
import useThemeState from '/imports/client/ui/utility/useThemeState';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['sub-click']);

const theme = useThemeState();

const activated = ref(undefined);
const hovering = ref(false);

const rollBonus = computed(() => {
  if (!props.model.attackRoll) return;
  return numberToSignedString(props.model.attackRoll.value);
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
  };
});

const actionTypeName = computed(() => {
    return translateOr(`actionTypes.${props.model.actionType}`, props.model.actionType);
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
  return docsToForest(descendants);
}).result;
</script>

<style lang="css" scoped>
.action-card {
  transition: box-shadow .4s cubic-bezier(0.25, 0.8, 0.25, 1),
    transform 0.075s ease;
}
.roll-bonus {
  color: rgba(0, 0, 0, 0.87);
}
.to-hit {
  color: rgba(0, 0, 0, 0.54);
  font-size: 18pt;
  flex-basis: 24px;
}
.avatar {
  min-width: 24px;
  min-height: 24px;
  line-height: 24px;
}

.label {
  font-size: 10pt;
  font-variant: all-small-caps;
  flex-grow: 1;
}

.damage {
  font-size: 12pt;
  font-weight: 500;
}
.action-title {
  font-size: 12pt;
  font-weight: 600;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant: all-small-caps;
}

.action-subtitle {
  font-variant: all-small-caps;
  font-size: 11pt;
}

.resources {
  font-size: 10pt;
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
