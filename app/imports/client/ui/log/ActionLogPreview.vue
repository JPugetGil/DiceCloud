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
          :color="model.color || 'grey'"
          size="32"
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
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import ActionLogPreviewContent from '/imports/client/ui/log/ActionLogPreviewContent.vue';
import Creatures from '/imports/api/creature/creatures/Creatures';

// TODO move content filtering to this component so we can determine if any content was hidden
// then show a button to reveal silenced content at a lower opacity

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  showName: Boolean,
});

const showSilenced = ref(false);

const creature = autorun(() => Creatures.findOne(props.model.creatureId)).result;
</script>
