<template>
  <div class="tag-targeting">
    <div class="d-flex flex-1-1 align-center">
      <v-btn
        variant="text"
        icon
        style="margin-top: -30px;"
        class="mr-2"
        :loading="addExtraTagsLoading"
        :disabled="extraTagsFull"
        @click="addExtraTags"
      >
        <v-icon>
          mdi-plus
        </v-icon>
      </v-btn>
      <smart-combobox
        :label="$t('forms.tagsRequired')"
        :hint="tagHint"
        class="mb-2"
        multiple
        small-chips
        deletable-chips
        persistent-hint
        :value="model[tagField]"
        :error-messages="errors[tagField]"
        @change="(value, ack) => change(tagField, value, ack)"
      />
    </div>
    <v-slide-x-transition
      group
    >
      <div
        v-for="(extras, i) in model[extraTagsField]"
        :key="extras._id"
        class="target-tags d-flex flex-1-1 align-center justify-space-between"
      >
        <smart-select
          :label="$t('forms.operation')"
          style="width: 90px; flex-grow: 0;"
          :items="[{ title: $t('common.or'), value: 'OR' }, { title: $t('common.not'), value: 'NOT' }]"
          :value="extras.operation"
          :error-messages="errors[extraTagsField] && errors[extraTagsField][i]"
          @change="(value, ack) => change([extraTagsField, i, 'operation'], value, ack)"
        />
        <smart-combobox
          :label="$t('forms.tags')"
          :hint="extras.operation === 'OR' ? orHint : notHint"
          class="mx-2 mb-2"
          multiple
          small-chips
          deletable-chips
          persistent-hint
          :value="extras.tags"
          @change="(value, ack) => change([extraTagsField, i, 'tags'], value, ack)"
        />
        <v-btn
          variant="text"
          icon
          style="margin-top: -30px;"
          @click="$emit('pull', {path: [extraTagsField, i]})"
        >
          <v-icon>mdi-delete</v-icon>
        </v-btn>
      </div>
    </v-slide-x-transition>
  </div>
</template>

<script setup>
import { t } from '/imports/client/ui/i18n';
import { ref, computed } from 'vue';
import propertySchemasIndex from '/imports/api/properties/computedPropertySchemasIndex';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  errors: {
    type: Object,
    required: true,
  },
  tagField: {
    type: String,
    default: 'targetTags',
  },
  extraTagsField: {
    type: String,
    default: 'extraTags',
  },
  tagHint: {
    type: String,
    default: () => t('forms.tagTargeting.tagHint'),
  },
  orHint: {
    type: String,
    default: () => t('forms.tagTargeting.orHint'),
  },
  notHint: {
    type: String,
    default: () => t('forms.tagTargeting.notHint'),
  },
});

const emit = defineEmits(['pull', 'push', 'change']);

const addExtraTagsLoading = ref(false);

const maxTags = computed(() => {
  if (!props.model?.type) return 0;
  const schema = propertySchemasIndex[props.model.type];
  return schema.get(props.extraTagsField, 'maxCount');
});

const extraTagsFull = computed(() => {
  if (!props.model[props.extraTagsField]) return false;
  return props.model[props.extraTagsField].length >= maxTags.value;
});

function addExtraTags() {
  addExtraTagsLoading.value = true;
  emit('push', {
    path: [props.extraTagsField],
    value: {
      _id: Random.id(),
      operation: 'OR',
      tags: [],
    },
    ack: () => addExtraTagsLoading.value = false,
  });
}

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>