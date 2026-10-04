<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('libraryFiles.importTitle') }}
      </v-toolbar-title>
    </template>
    <p class="text-body-medium text-medium-emphasis mt-0">
      {{ $t('libraryFiles.importHint') }}
    </p>
    <v-file-input
      :label="$t('libraryFiles.file')"
      accept=".json,.gz,application/json,application/gzip"
      prepend-icon=""
      prepend-inner-icon="mdi-file-upload-outline"
      variant="outlined"
      :disabled="running"
      :error-messages="readError"
      data-id="library-import-file"
      @update:model-value="read"
    />
    <template v-if="file">
      <div
        v-if="file.collection"
        class="text-title-small mb-1"
      >
        <v-icon
          start
          size="small"
        >
          mdi-folder-multiple-outline
        </v-icon>
        {{ file.collection.name || $t('libraryFiles.untitledCollection') }}
      </div>
      <v-list
        density="compact"
        class="py-0"
        data-id="library-import-list"
      >
        <v-list-item
          v-for="entry in file.libraries"
          :key="entry.library._id"
          :title="entry.library.name"
          :subtitle="statusText(entry)"
          :data-id="`library-import-${entry.library._id}`"
        >
          <template #prepend>
            <v-progress-circular
              v-if="results[entry.library._id] === 'running'"
              indeterminate
              size="20"
              width="2"
              class="me-4"
            />
            <v-icon
              v-else
              :color="statusColor(entry)"
            >
              {{ statusIcon(entry) }}
            </v-icon>
          </template>
        </v-list-item>
      </v-list>
      <v-checkbox
        v-model="replace"
        :label="$t('libraryFiles.replace')"
        :hint="$t('libraryFiles.replaceHint')"
        persistent-hint
        density="compact"
        :disabled="running || done"
        data-id="library-import-replace"
      />
      <v-checkbox
        v-model="makePublic"
        :label="$t('libraryFiles.makePublic')"
        :hint="$t('libraryFiles.makePublicHint')"
        persistent-hint
        density="compact"
        :disabled="running || done"
        data-id="library-import-public"
      />
      <v-progress-linear
        v-if="running || done"
        :model-value="progress"
        color="primary"
        height="6"
        rounded
        class="mt-4"
        :aria-label="$t('libraryFiles.importTitle')"
      />
    </template>
    <template #actions>
      <v-spacer />
      <v-btn
        v-if="!done"
        variant="text"
        :disabled="!file || running"
        :loading="running"
        data-id="library-import-submit"
        @click="importAll"
      >
        {{ $t('libraryFiles.import') }}
      </v-btn>
      <v-btn
        v-else
        variant="text"
        data-id="library-import-done"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.done') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import { importLibrary, importLibraryCollection } from '/imports/api/library/methods/libraryFiles';
import { readLibraryFile } from '/imports/ui/library/libraryFiles';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

/**
 * Admin only: imports the libraries of a file, saved from a library or
 * collection page here or on another instance, one library after the other.
 */
const { t } = useI18n();
const dialogStackStore = useDialogStackStore();

const file = ref(undefined);
const readError = ref(undefined);
const replace = ref(false);
const makePublic = ref(false);
const running = ref(false);
const done = ref(false);
// By library id: 'running', 'imported', 'replaced', 'skipped' or an error message
const results = ref({});

const progress = computed(() => {
  const total = file.value?.libraries.length || 1;
  const finished = Object.values(results.value).filter(result => result !== 'running').length;
  return Math.min(100, finished / total * 100);
});

async function read(value) {
  const chosen = Array.isArray(value) ? value[0] : value;
  file.value = undefined;
  readError.value = undefined;
  results.value = {};
  done.value = false;
  if (!chosen) return;
  try {
    file.value = await readLibraryFile(chosen);
  } catch (error) {
    console.error(error);
    readError.value = t('libraryFiles.notALibraryFile');
  }
}

const isError = result => result && !['running', 'imported', 'replaced', 'skipped'].includes(result);

function statusText({ library, nodes }) {
  const result = results.value[library._id];
  if (!result || result === 'running') return t('libraryFiles.nodeCount', { count: nodes.length }, nodes.length);
  if (isError(result)) return result;
  return t(`libraryFiles.status.${result}`);
}

function statusIcon({ library }) {
  const result = results.value[library._id];
  if (!result) return 'mdi-bookshelf';
  if (isError(result)) return 'mdi-alert-circle-outline';
  return { imported: 'mdi-check-circle-outline', replaced: 'mdi-sync', skipped: 'mdi-skip-next-circle-outline' }[result];
}

function statusColor({ library }) {
  const result = results.value[library._id];
  if (isError(result)) return 'error';
  if (result === 'imported' || result === 'replaced') return 'success';
  return undefined;
}

async function importAll() {
  running.value = true;
  for (const { library, nodes } of file.value.libraries) {
    results.value[library._id] = 'running';
    try {
      const { status } = await importLibrary.callAsync({
        library: { _id: library._id, name: library.name, description: library.description || undefined },
        nodes,
        replace: replace.value,
        makePublic: makePublic.value,
      });
      results.value[library._id] = status;
    } catch (error) {
      console.error(error);
      results.value[library._id] = error.reason || error.message;
    }
  }
  const collection = file.value.collection;
  if (collection?._id) {
    try {
      await importLibraryCollection.callAsync({
        collection: {
          _id: collection._id,
          name: collection.name || undefined,
          description: collection.description || undefined,
          libraries: collection.libraries || file.value.libraries.map(({ library }) => library._id),
        },
        replace: replace.value,
        makePublic: makePublic.value,
      });
    } catch (error) {
      console.error(error);
      readError.value = error.reason || error.message;
    }
  }
  running.value = false;
  done.value = true;
}
</script>
