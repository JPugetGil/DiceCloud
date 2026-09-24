<template>
  <div class="creature-template-form">
    <v-row>
      <v-col
        cols="12"
        md="6"
      >
        <smart-image-input
          label="Picture"
          hint="A link to a high resolution image"
          :value="model.picture"
          :error-messages="errors.picture"
          @change="(value, ack) => $emit('change', {path: ['picture'], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-image-input
          label="Avatar"
          hint="A link to a smaller, square image to use as an avatar"
          :value="model.avatarPicture"
          :error-messages="errors.avatarPicture"
          @change="(value, ack) => $emit('change', {path: ['avatarPicture'], value, ack})"
        />
      </v-col>
    </v-row>
    <inline-computation-field
      label="Description"
      hint="A brief description of the creature, shown in the log when it is summoned"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections
      v-if="$slots.default"
      type="creatureTemplate"
    >
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import SmartImageInput from '/imports/client/ui/components/global/SmartImageInput.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';

defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

defineEmits(['change']);

</script>
