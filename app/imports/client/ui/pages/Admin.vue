<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-text>
            <h4>{{ $t('admin.currentDbVersion', { version: versions && versions.dbVersion }) }}</h4>
            <h4 v-if="schemaVersion == versions.dbVersion ">
              {{ $t('admin.upToDate') }}
            </h4>
            <h4 v-else>
              {{ $t('admin.expectedDbVersion', { version: schemaVersion }) }}
            </h4>
            <h4>{{ $t('admin.gitVersion', { version: versions && versions.gitVersion }) }}</h4>
            <v-alert
              v-if="versionError"
              type="error"
            >
              {{ versionError }}
            </v-alert>
            <v-btn
              variant="text"
              icon
              :loading="loadingVersion"
              @click="refreshVersions"
            >
              <v-icon>mdi-refresh</v-icon>
            </v-btn>
            <v-alert
              type="warning"
              variant="outlined"
            >
              {{ $t('admin.backupWarning') }}
            </v-alert>
            <v-btn
              :disabled="!(schemaVersion > (versions && versions.dbVersion))"
              :loading="loadingMigration"
              @click="migrate"
            >
              {{ $t('admin.migrate', { version: schemaVersion }) }}
            </v-btn>
            <v-alert
              v-if="migrateError"
              type="error"
            >
              {{ migrateError }}
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import getVersion from '/imports/migrations/methods/getVersion';
import migrateTo from '/imports/migrations/methods/migrateTo';
import SCHEMA_VERSION from '/imports/constants/SCHEMA_VERSION';

const loadingVersion = ref(false);

const versions = ref({});


const versionError = ref(undefined);

const migrateError = ref(undefined);

const loadingMigration = ref(false);

const schemaVersion = ref(SCHEMA_VERSION);

async function refreshVersions() {
  loadingVersion.value = true;
  try {
    versions.value = await getVersion.callAsync();
    versionError.value = undefined;
  } catch (error) {
    versionError.value = error;
  } finally {
    loadingVersion.value = false;
  }
}

async function migrate() {
  loadingMigration.value = true;
  try {
    await migrateTo.callAsync({ version: SCHEMA_VERSION });
    migrateError.value = undefined;
    await refreshVersions();
  } catch (error) {
    migrateError.value = error;
  } finally {
    loadingMigration.value = false;
  }
}

onMounted(() => {
  refreshVersions();
});
</script>

<style lang="css" scoped>
</style>
