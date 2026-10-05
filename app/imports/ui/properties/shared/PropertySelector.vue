<template>
  <div class="bg-raised">
    <v-container fluid>
      <v-row
        class="justify-center justify-sm-start"
        density="compact"
      >
        <template v-if="properties.suggested">
          <v-col cols="12">
            <v-list-subheader class="ps-4">
              {{ $t('selector.suggested') }}
            </v-list-subheader>
          </v-col>
          <template
            v-for="(property, type) in properties.suggested"
            :key="type"
          >
            <v-col
              v-if="!noLibraryOnlyProps || !property.libraryOnly"
              md="4"
              sm="6"
              cols="10"
            >
              <property-select-card
                :property="property"
                :type="type"
                :disabled="type === currentType"
                @click="$emit('select', type)"
              />
            </v-col>
          </template>
        </template>
        <v-col
          v-if="properties.suggested"
          cols="12"
        >
          <v-list-subheader class="ps-4">
            {{ $t('selector.more') }}
          </v-list-subheader>
        </v-col>
        <template
          v-for="(property, type) in properties.more"
          :key="type"
        >
          <v-col
            v-if="!noLibraryOnlyProps || !property.libraryOnly"
            md="4"
            sm="6"
            cols="10"
          >
            <property-select-card
              :property="property"
              :type="type"
              :disabled="type === currentType"
              @click="$emit('select', type)"
            />
          </v-col>
        </template>
      </v-row>
    </v-container>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PROPERTIES from '/imports/constants/PROPERTIES';
import PropertySelectCard from '/imports/ui/properties/shared/PropertySelectCard.vue';

const props = defineProps({
  noLibraryOnlyProps: Boolean,
  parentType: {
    type: String,
    default: undefined,
  },
  currentType: {
    type: String,
    default: undefined,
  },
});

defineEmits(['select']);

const properties = computed(() => {
  let suggested;
  let more = {};
  if (props.parentType) {
    for (const key in PROPERTIES) {
      let prop = PROPERTIES[key];
      if (prop.suggestedParents.includes(props.parentType)) {
        if (!suggested) suggested = {};
        suggested[key] = prop;
      } else {
        more[key] = prop;
      }
    }
    return { suggested, more };
  } else {
    return { more: PROPERTIES };
  }
});
</script>

<style lang="css" scoped>

</style>
