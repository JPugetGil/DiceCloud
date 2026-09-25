<template>
  <smart-select
    append-icon="mdi-menu-down"
    :clearable="clearable"
    class="ml-3"
    v-bind="$attrs"
    :menu-props="{transition: 'slide-y-transition', lazy: true}"
    :items="values"
    :value="value"
    @change="(value, ack) => $emit('change', value, ack)"
  >
    <template #prepend>
      <v-icon

        class="icon"
        :class="iconClass"
      >
        {{ displayedIcon }}
      </v-icon>
    </template>
  </smart-select>
</template>

<script setup>
import { ref, watch } from 'vue';
import getProficiencyIcon from '/imports/client/ui/utility/getProficiencyIcon';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const ICON_SPIN_DURATION = 300;

const props = defineProps({
  value: {
    type: Number,
    default: undefined,
  },
  clearable: {
    type: Boolean,
    default: true,
  },
});

defineEmits(['change']);

const displayedIcon = ref('mdi-radiobox-blank');

const iconClass = ref('');

const values = ref([
  {value: 1, title: t('proficiencyLevels.proficient')},
  {value: 0.49, title: t('proficiencyLevels.halfDown')},
  {value: 0.5, title: t('proficiencyLevels.halfUp')},
  {value: 2, title: t('proficiencyLevels.double')},
]);

watch(() => props.value, (newValue) => {
  let newIcon = getProficiencyIcon(newValue);
  iconClass.value='leaving';
  setTimeout(() => {
    displayedIcon.value = newIcon;
    iconClass.value='arriving';
    requestAnimationFrame(() => {
      iconClass.value='';
    });
  }, ICON_SPIN_DURATION / 2);
}, { immediate: true });
</script>

<style lang="css" scoped>
  .v-theme--light .icon {
    color: black;
  }
  .icon {
    min-width: 30px;
    transition: transform 0.15s linear, opacity 0.15s ease;
    transform-origin: 18px center;
    margin-left: -12px;
  }
  .icon.leaving {
    transform: translateY(-24px);
    opacity: 0;
  }
  .icon.arriving {
    transform: translateY(24px);
    opacity: 0;
    transition: none;
  }
  .hidden {
    visibility: hidden;
  }
</style>
