<template>
  <v-card data-id="database-usage">
    <v-card-title class="d-flex align-center">
      {{ $t('admin.database.title') }}
      <v-spacer />
      <v-btn
        icon="mdi-refresh"
        variant="text"
        :loading="loading"
        :aria-label="$t('admin.refresh')"
        :title="$t('admin.refresh')"
        @click="refresh"
      />
    </v-card-title>
    <v-card-text>
      <v-alert
        v-if="error"
        type="error"
      >
        {{ error }}
      </v-alert>
      <template v-else-if="usage">
        <v-row>
          <v-col
            cols="6"
            sm="3"
            data-id="database-total-size"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.database.totalSize') }}
            </div>
            <div class="text-headline-small">
              {{ prettyBytes(usage.totalSize) }}
            </div>
          </v-col>
          <v-col
            cols="6"
            sm="3"
            data-id="database-data-size"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.database.dataSize') }}
            </div>
            <div class="text-headline-small">
              {{ prettyBytes(usage.dataSize) }}
            </div>
          </v-col>
          <v-col
            cols="6"
            sm="3"
            data-id="database-index-size"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.database.indexSize') }}
            </div>
            <div class="text-headline-small">
              {{ prettyBytes(usage.indexSize) }}
            </div>
          </v-col>
          <v-col
            cols="6"
            sm="3"
            data-id="database-documents"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.database.documents') }}
            </div>
            <div class="text-headline-small">
              {{ formatNumber(usage.documentCount) }}
            </div>
          </v-col>
        </v-row>
        <div
          v-if="usage.fsTotalSize"
          class="mt-4"
          data-id="database-disk"
        >
          <v-progress-linear
            :model-value="diskPercent"
            :color="diskPercent >= 90 ? 'error' : diskPercent >= 75 ? 'warning' : 'primary'"
            height="8"
            rounded
            :aria-label="$t('admin.database.disk')"
          />
          <div class="text-body-medium text-medium-emphasis mt-1">
            {{ $t('admin.database.diskUsed', {
              used: prettyBytes(usage.fsUsedSize || 0),
              total: prettyBytes(usage.fsTotalSize),
              free: prettyBytes(Math.max(usage.fsTotalSize - (usage.fsUsedSize || 0), 0)),
            }) }}
          </div>
        </div>
        <v-alert
          v-if="usage.collectionsError"
          type="warning"
          variant="tonal"
          class="mt-4"
        >
          {{ $t('admin.database.collectionsError', { reason: usage.collectionsError }) }}
        </v-alert>
        <v-table
          v-if="usage.collections.length"
          density="compact"
          fixed-header
          :height="usage.collections.length > 10 ? 400 : undefined"
          class="mt-4"
          data-id="database-collections"
        >
          <thead>
            <tr>
              <th>{{ $t('admin.database.collection') }}</th>
              <th class="text-end">
                {{ $t('admin.database.documents') }}
              </th>
              <th class="text-end">
                {{ $t('admin.database.dataSize') }}
              </th>
              <th class="text-end">
                {{ $t('admin.database.totalSize') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="collection in usage.collections"
              :key="collection.name"
            >
              <td>{{ collection.name }}</td>
              <td class="text-end">
                {{ formatNumber(collection.documentCount) }}
              </td>
              <td class="text-end">
                {{ prettyBytes(collection.dataSize) }}
              </td>
              <td class="text-end">
                {{ prettyBytes(collection.totalSize) }}
              </td>
            </tr>
          </tbody>
        </v-table>
        <p class="mt-4 mb-0 text-body-medium text-medium-emphasis">
          {{ $t('admin.database.hint', { database: usage.name }) }}
        </p>
      </template>
      <v-progress-linear
        v-if="loading && !usage"
        indeterminate
        :aria-label="$t('admin.database.title')"
      />
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import prettyBytes from 'pretty-bytes';
import { useI18n } from 'vue-i18n';
import getDatabaseUsage from '/imports/api/admin/methods/getDatabaseUsage';

const { locale } = useI18n();

const usage = ref(undefined);
const loading = ref(false);
const error = ref(undefined);

const diskPercent = computed(() => {
  const { fsUsedSize = 0, fsTotalSize } = usage.value || {};
  if (!fsTotalSize) return 0;
  return Math.min(100, fsUsedSize / fsTotalSize * 100);
});

function formatNumber(value) {
  return new Intl.NumberFormat(locale.value).format(value);
}

async function refresh() {
  loading.value = true;
  try {
    usage.value = await getDatabaseUsage.callAsync();
    error.value = undefined;
  } catch (e) {
    error.value = e.reason || e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
