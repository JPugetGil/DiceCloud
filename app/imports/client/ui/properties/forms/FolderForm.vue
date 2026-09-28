<template>
  <div class="folder-form">
    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />
    <form-sections type="folder">
      <form-section :name="$t('forms.folder.grouping')">
        <smart-switch
          :label="$t('forms.folder.groupOnCard')"
          :value="model.groupStats"
          :error-messages="errors.groupStats"
          @change="(value, ack) => change('groupStats', value, ack)"
        />
        <v-expand-transition>
          <div v-if="model.groupStats">
            <smart-switch
              :label="$t('forms.folder.hideChildren')"
              :value="model.hideStatsGroup"
              :error-messages="errors.hideStatsGroup"
              @change="(value, ack) => change('hideStatsGroup', value, ack)"
            />
            <smart-select
              clearable
              :label="$t('forms.folder.tab')"
              :items="[
                { title: $t('forms.folder.statsTab'), value: 'stats' },
                { title: $t('forms.folder.featuresTab'), value: 'features' },
                { title: $t('forms.folder.actionsTab'), value: 'actions' },
                { title: $t('forms.folder.spellsTab'), value: 'spells' },
                { title: $t('forms.folder.inventoryTab'), value: 'inventory' },
                { title: $t('forms.folder.journalTab'), value: 'journal' },
                { title: $t('forms.folder.buildTab'), value: 'build' },
              ]"
              :value="model.tab"
              :error-messages="errors.tab"
              :menu-props="{auto: true, lazy: true}"
              @change="(value, ack) => changeTab('tab', value, ack)"
            />
            <smart-select
              clearable
              :label="$t('forms.folder.location')"
              :items="locationItems"
              :value="model.location"
              :error-messages="errors.location"
              :menu-props="{auto: true, lazy: true}"
              @change="(value, ack) => change('location', value, ack)"
            />
          </div>
        </v-expand-transition>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change']);

const locationItems = computed(() => {
  if (props.model.tab === 'stats') {
    return [
      { title: t('forms.folder.start'), value: 'start' },
      { title: t('forms.folder.afterEvents'), value: 'events' },
      { title: t('forms.folder.afterStats'), value: 'stats' },
      { title: t('forms.folder.afterSkills'), value: 'skills' },
      { title: t('forms.folder.afterProficiencies'), value: 'proficiencies' },
      { title: t('forms.folder.end'), value: 'end' },
    ];
  } else {
    return [
      { title: t('forms.folder.start'), value: 'start' },
      { title: t('forms.folder.end'), value: 'end' },
    ];
  }
});

function changeTab(path, value, ack) {
  if (!Array.isArray(path)){
    path = [path];
  }
  if (
    value !== 'stats' &&
    (props.model.location !== 'start' && props.model.location !== 'end')
    || (!props.model.location && value)
  )
  emit('change', {path: ['location'], value: 'start'});
  emit('change', {path, value, ack});
}

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>

<style lang="css" scoped>

</style>
