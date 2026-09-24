<template>
  <div class="slot-filler-viewer">
    <v-row dense>
      <property-field
        v-if="model.description"
        name="Description"
        :cols="{cols: 12}"
      >
        <markdown-text :markdown="model.description" />
      </property-field>
    </v-row>
  </div>
</template>

<script setup>
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});


</script>
