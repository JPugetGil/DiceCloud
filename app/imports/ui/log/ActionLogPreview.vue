<template>
  <div
    class="px-2 my-1 rounded-sm"
    :data-id="model.actionId"
  >
    <v-list-item
      v-if="model.creatureId && creature"
      density="compact"
      class="pl-0"
    >
      <template #prepend>
        <v-avatar
          variant="flat"
          :color="model.color || 'grey'"
          size="32"
        >
          <v-img
            v-if="creature.avatarPicture"
            :src="creature.avatarPicture"
            :alt="creature.name"
            cover
            position="top"
          />
          <span v-else>
            {{ creature.name && creature.name[0] || '?' }}
          </span>
        </v-avatar>
      </template>

      <v-list-item-title>
        {{ creature.name }}
      </v-list-item-title>
    </v-list-item>
    <action-log-preview-content
      v-if="model.text || (model.content && model.content.length)"
      :model="model.content"
      :show-silenced="showSilenced"
      class="pl-10"
    />
    <v-btn
      v-if="silencedCount"
      variant="text"
      size="small"
      class="ml-8"
      data-id="toggle-silenced"
      @click="showSilenced = !showSilenced"
    >
      {{ showSilenced ? $t('log.hideSilenced') : $t('log.showSilenced', { count: silencedCount }, silencedCount) }}
    </v-btn>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import ActionLogPreviewContent from '/imports/ui/log/ActionLogPreviewContent.vue';
import Creatures from '/imports/api/creature/creatures/Creatures';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  showName: Boolean,
});

// Silenced lines are hidden, but can be shown, dimmed
const showSilenced = ref(false);
const silencedCount = computed(() => props.model.content?.filter(c => c.silenced).length || 0);

const creature = autorun(() => Creatures.findOne(props.model.creatureId)).result;
</script>
