<template>
  <v-card data-id="s3-usage">
    <v-card-title class="d-flex align-center">
      {{ $t('admin.s3.title') }}
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
        <v-alert
          v-if="!usage.useS3"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          {{ $t('admin.s3.notConfigured') }}
        </v-alert>
        <v-alert
          v-if="usage.listingError"
          type="warning"
          variant="tonal"
          class="mb-4"
          data-id="s3-listing-error"
        >
          {{ usage.listingError.accessDenied
            ? $t('admin.s3.listingDenied', { bucket: usage.bucket })
            : $t('admin.s3.listingFailed', { reason: usage.listingError.message }) }}
        </v-alert>
        <v-row>
          <v-col
            cols="12"
            sm="4"
            data-id="s3-space-used"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.s3.spaceUsed') }}
            </div>
            <div class="text-headline-small">
              {{ prettyBytes(usage.bytes) }}
            </div>
          </v-col>
          <v-col
            cols="12"
            sm="4"
            data-id="s3-object-count"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.s3.objects') }}
            </div>
            <div class="text-headline-small">
              {{ usage.objectCount }}
            </div>
          </v-col>
          <v-col
            cols="12"
            sm="4"
            data-id="s3-monthly-cost"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.s3.monthlyCost') }}
            </div>
            <div class="text-headline-small">
              {{ formatCost(usage.monthlyCost) }}
            </div>
          </v-col>
        </v-row>
        <v-table
          v-if="usage.prefixes.length"
          density="compact"
          class="mt-4"
          data-id="s3-folders"
        >
          <thead>
            <tr>
              <th>{{ $t('admin.s3.folder') }}</th>
              <th class="text-end">
                {{ $t('admin.s3.objects') }}
              </th>
              <th class="text-end">
                {{ $t('admin.s3.size') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="folder in usage.prefixes"
              :key="folder.prefix"
            >
              <td>{{ folderName(folder.prefix) }}</td>
              <td class="text-end">
                {{ folder.objectCount }}
              </td>
              <td class="text-end">
                {{ prettyBytes(folder.bytes) }}
              </td>
            </tr>
          </tbody>
        </v-table>
        <p class="mt-4 mb-0 text-body-medium text-medium-emphasis">
          {{ $t('admin.s3.costHint', {
            region: usage.region,
            price: formatPrice(usage.pricePerGB),
          }) }}
        </p>
      </template>
      <v-progress-linear
        v-if="loading && !usage"
        indeterminate
        :aria-label="$t('admin.s3.title')"
      />
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import prettyBytes from 'pretty-bytes';
import { useI18n } from 'vue-i18n';
import getS3Usage from '/imports/api/files/methods/getS3Usage';
import { APP_FILES_PREFIX } from '/imports/api/files/bucketUsage';

const { locale, t } = useI18n();

const usage = ref(undefined);
const loading = ref(false);
const error = ref(undefined);

function folderName(prefix) {
  if (prefix === APP_FILES_PREFIX) return t('admin.s3.appFiles', { folder: prefix });
  if (!prefix) return t('admin.s3.bucketRoot');
  return prefix;
}

function formatMoney(amount, options) {
  return new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: usage.value.currency,
    ...options,
  }).format(amount);
}

function formatCost(amount) {
  // Small files cost fractions of a cent: don't show them as free
  if (amount > 0 && amount < 0.01) return `< ${formatMoney(0.01)}`;
  return formatMoney(amount);
}

function formatPrice(amount) {
  return formatMoney(amount, { maximumFractionDigits: 4 });
}

async function refresh() {
  loading.value = true;
  try {
    usage.value = await getS3Usage.callAsync();
    error.value = undefined;
  } catch (e) {
    error.value = e.reason || e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
