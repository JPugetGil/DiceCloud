<template>
  <div class="damage-viewer">
    <v-row dense>
      <property-field
        :name="$t('viewers.amount')"
        large
        center
        :calculation="model.amount"
      />
      <property-field
        :name="$t('common.type')"
        :value="type"
      />
      <property-field
        v-if="model.target === 'self'"
        :name="$t('viewers.target')"
        :value="$t('targets.self')"
      />
      <template v-if="model.save">
        <property-field
          :name="$t('check.dc')"
          large
          center
          :calculation="model.save.dc"
        />
        <property-field
          :name="$t('forms.save')"
          mono
          :value="model.save.stat"
        />
        <property-field
          :name="$t('viewers.onSuccessfulSave')"
          v-bind="saveDamage"
        />
      </template>
    </v-row>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import { useI18n } from 'vue-i18n';
import { damageTypeName } from '/imports/client/ui/i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const type = computed(() => {
  if (props.model.damageType === 'healing') return damageTypeName(props.model.damageType);
  return t('viewers.typedDamage', { type: damageTypeName(props.model.damageType) })
});

const saveDamage = computed(() => {
  if (!props.model.save) return;
  if (!props.model.save.damageFunction?.calculation) {
    return { value: t('viewers.halfDamage') };
  }
  if (props.model.save.damageFunction.calculation == '0' || props.model.save.damageFunction.value === 0) {
    return { value: t('viewers.noDamage') };
  }
  return { calculation: props.model.save.damageFunction };
});
</script>

<style lang="css" scoped>

</style>
