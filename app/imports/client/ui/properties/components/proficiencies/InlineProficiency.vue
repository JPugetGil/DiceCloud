<template>
  <v-list-item
    class="inline-proficiency d-flex flex-1-1 align-center"
    :class="{'text-disabled': model?.overridden}"
    density="compact"
    @click="click"
  >
    <div class="effect-icon">
      <proficiency-icon
        :value="model?.proficiency"
        class="prof-icon"
      />
    </div>

    <v-list-item-title>
      <span
        class="effect-value mr-2"
      >
        {{ displayedValue }}
      </span>
      {{ displayedText }}
    </v-list-item-title>
  </v-list-item>
</template>

<script setup lang="js">
import { computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import ProficiencyIcon from '/imports/client/ui/properties/shared/ProficiencyIcon.vue';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';

const props = defineProps({
  proficiencyId: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['click']);

const model = autorun(() => CreatureProperties.findOne(props.proficiencyId)).result;

const displayedText = computed(() => {
  return model.value?.name || (model.value?.type == 'proficiency' ? 'Proficiency' : 'Skill');
});

const displayedValue = computed(() => {
  return model.value ? numberToSignedString(model.value.value) : '';
});

function click(e) {
  emit('click', e);
}
</script>

<style lang="css" scoped>
  .icon, .effect-icon {
    min-width: 20px;
  }
  .icon {
    color: inherit !important;
  }
  .net-effect {
    flex-grow: 0;
    flex-shrink: 0;
  }
  .effect-value {
    min-width: 30px;
    text-align: center;
  }
  .prof-icon {
    width: 24px;
    margin: 0 8px;
  }
</style>
