<template>
  <div class="buff-remover-form">
    <smart-toggle
      :label="$t('forms.buffRemover.targetBuffs')"
      :value="model.targetParentBuff ? 'parent' : 'tag'"
      :options="[
        {name: $t('forms.buffRemover.tagged'), value: 'tag'},
        {name: $t('forms.buffRemover.parent'), value: 'parent'},
      ]"
      @change="(value, ack) => change('targetParentBuff', value === 'parent' ? true : undefined, ack)"
    />
    <v-expand-transition>
      <div v-if="!model.targetParentBuff">
        <tag-targeting
          :model="model"
          :errors="errors"
          @change="e => $emit('change', e)"
          @push="e => $emit('push', e)"
          @pull="e => $emit('pull', e)"
        />
        <div class="mb-6" />
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <smart-toggle
              :label="$t('forms.buffRemover.matching')"
              :value="model.removeAll ? 'all' : 'one'"
              :options="[
                {name: $t('forms.buffRemover.one'), value: 'one'},
                {name: $t('forms.buffRemover.all'), value: 'all'},
              ]"
              @change="(value, ack) => change('removeAll', value === 'all' ? true : undefined, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <smart-toggle
              :label="$t('forms.targetCreature')"
              :value="model.target"
              :options="[
                {name: $t('forms.actionTarget'), value: 'target'},
                {name: $t('forms.self'), value: 'self'},
              ]"
              :error-messages="errors.target"
              @change="(value, ack) => change('target', value, ack)"
            />
          </v-col>
        </v-row>
      </div>
    </v-expand-transition>
    <form-sections type="buffRemover">
      <form-section
        v-if="$slots.children"
        :name="$t('forms.children')"
        standalone
      >
        <slot name="children" />
      </form-section>
      <form-section
        :name="$t('forms.log')"
      >
        <smart-switch
          :label="$t('forms.dontShowInLog')"
          :value="model.silent"
          :error-messages="errors.silent"
          @change="(value, ack) => change('silent', value, ack)"
        />
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import TagTargeting from '/imports/client/ui/properties/forms/shared/TagTargeting.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
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

const emit = defineEmits(['change', 'push', 'pull']);






function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>

<style lang="css" scoped>
</style>
