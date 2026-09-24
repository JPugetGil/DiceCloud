<template>
  <div class="log-content">
    <div
      v-for="(contentGroup, index) in contentByTargetId"
      :key="index"
      class="d-flex justify-space-between mb-2"
    >
      <div class="d-flex flex-wrap">
        <div
          v-for="(content, contentIndex) in contentGroup.content"
          :key="contentIndex"
          class="mx-2 my-1"
          :class="{'full-width': !content.inline}"
        >
          <div
            class="content-name text-body"
          >
            {{ content.name }}
          </div>
          <markdown-text
            v-if="content.value"
            class="content-value text-body-2"
            :markdown="content.value"
          />
          <div
            v-else
            style="min-height: 12px;"
          />
        </div>
      </div>
      <div
        v-if="contentGroup.targetIds && contentGroup.targetIds.length"
        class="content-target-ids d-flex flex-column justify-center"
      >
        <v-tooltip
          v-for="creature in contentGroup.targetCreatures"
          :key="creature._id"
          location="left"
        >
          <template #activator="{ props: activatorProps }">
            <v-avatar
              :color="model.color || 'grey'"
              size="28"
              class="ma-2"

              v-bind="activatorProps"
            >
              <img
                v-if="creature.avatarPicture"
                :src="creature.avatarPicture"
                :alt="creature.name"
              >
              <span v-else>
                {{ creature.name && creature.name[0] || '?' }}
              </span>
            </v-avatar>
          </template>
          <span>{{ creature.name }}</span>
        </v-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="js">
import { isEqual } from 'lodash';
import { autorun } from 'vue-meteor-tracker';
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import Creatures from '/imports/api/creature/creatures/Creatures';

const props = defineProps({
  model: {
    type: Array,
    default: () => [],
  },
  showSilenced: {
    type: Boolean,
    default: false,
  },
});

const contentByTargetId = autorun(() => {
  const content = [];
  const creaturesById = {};
  const getCreature = creatureId => {
    if (creaturesById[creatureId]) return creaturesById[creatureId];
    return creaturesById[creatureId] = Creatures.findOne(creatureId, {
      fields: { _id: 1, avatarPicture: 1, name: 1 },
    });
  };
  let currentContent = undefined;
  const filteredModel = props.model
    .filter(contentItem => !contentItem.silenced || props.showSilenced);
  for (const contentItem of filteredModel) {
    if (!currentContent || !isEqual(currentContent.targetIds, contentItem.targetIds)) {
      if (currentContent) {
        content.push(currentContent);
      }
      currentContent = {
        targetIds: contentItem.targetIds,
        targetCreatures: contentItem.targetIds?.map(getCreature) ?? [],
        content: [contentItem],
      };
    } else {
      currentContent.content.push(contentItem);
    }
  }
  if (currentContent) content.push(currentContent);
  return content;
}).result;
</script>

<style lang="css" scoped>
  .full-width {
    width: 100%;
  }
  .content-target-ids {
    border-left: solid 1px hsl(0deg 0% 50% / 20%);
  }
</style>

<style lang="css">
  .log-content .content-value > p:last-of-type{
    margin-bottom: 0;
  }
</style>
