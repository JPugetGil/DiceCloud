<template>
  <div>
    <div class="content">
      <v-card class="ma-4">
        <v-card-text>
          <div class="d-flex flex-column align-center">
            <v-file-input
              label="Metadata JSON"
              @update:model-value="metadataFileChanged"
            />
            <v-file-input
              label="Sprite JSON"
              @update:model-value="spriteFileChanged"
            />
            <icon-picker
              :value="testIcon"
              @change="testIconChange"
            />
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { importIcons, importIconMetadata } from '/imports/client/ui/icons/importIcons';
import IconPicker from '/imports/client/ui/components/global/IconPicker.vue';

const testIcon = ref();

const firstFile = value => Array.isArray(value) ? value[0] : value;

function spriteFileChanged(value) {
  const file = firstFile(value);
  if (file) importIcons(file);
}

function metadataFileChanged(value) {
  const file = firstFile(value);
  if (file) importIconMetadata(file);
}

function testIconChange(value, ack) {
  setTimeout(() => {
    testIcon.value = value;
    ack();
  }, 1000);
}
</script>

<style lang="css" scoped>
  svg {
    height: 64px;
    width: 64px;
  }
  .v-card {
    height: 100%;
  }
</style>
