<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('library.newLibraryTitle') }}
      </v-toolbar-title>
    </template>
    <text-field
      :label="$t('common.name')"
      :value="library.name"
      :debounce-time="0"
      @change="nameChanged"
    />
    <text-area
      :label="$t('common.description')"
      :value="library.description"
      :debounce-time="0"
      @change="descriptionChanged"
    />
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        :disabled="!valid"
        @click="dialogStackStore.popDialogStack(library)"
      >
        {{ $t('library.insertLibrary') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref} from 'vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const library = ref({
  name: t('library.newLibraryTitle'),
  description: undefined,
});

const valid = ref(true);

const dialogStackStore = useDialogStackStore();

function nameChanged(val, ack) {
  if (val) {
    library.value.name = val;
    valid.value = true;
    ack();
  } else {
    valid.value = false;
    ack(t('common.nameRequired'))
  }
}

function descriptionChanged(val, ack) {
  library.value.description = val;
  ack();
}
</script>

<style lang="css" scoped>

</style>
