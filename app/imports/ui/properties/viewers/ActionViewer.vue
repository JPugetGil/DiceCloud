<template>
  <div class="action-viewer">
    <v-row density="compact">
      <property-field
        v-if="context.creatureId"
        :name="model.type === 'spell'? $t('viewers.castSpell') : $t('viewers.applyAction')"
        center
      >
        <v-btn
          variant="outlined"
          style="font-size: 18px;"
          class="ma-2"
          data-id="do-action-button"
          :color="model.color || 'primary'"
          icon
          :loading="doActionLoading"
          :disabled="model.insufficientResources || !context.editPermission"
          @click.stop="doAction('auto')"
        >
          <property-icon
            :model="model"
          />
        </v-btn>
      </property-field>
      <!-- Its targets chosen first, outside a fight too; a spell's in its cast dialog -->
      <property-field
        v-if="context.creatureId && model.type !== 'spell' && model.target !== 'self'"
        :name="$t('targetPicker.target')"
        center
      >
        <v-btn
          variant="outlined"
          class="ma-2"
          icon
          data-id="target-action-button"
          :aria-label="$t('targetPicker.target')"
          :disabled="model.insufficientResources || !context.editPermission"
          @click.stop="doAction('always')"
        >
          <v-icon>mdi-target</v-icon>
        </v-btn>
      </property-field>
      <property-field
        :name="$t('viewers.toHit')"
        large
        center
        signed
        :calculation="model.attackRoll"
      />
      <property-field
        :name="$t('viewers.actionType')"
        :value="actionTypes[model.actionType]"
      />
      <property-field
        :name="$t('viewers.targeting')"
        :value="targetTypes[model.target]"
      />
      <property-field
        v-if="model.uses"
        :name="$t('viewers.uses')"
      >
        <template v-if="context.creatureId && model.uses.value">
          <v-spacer />
          {{ usesLeft }}/{{ model.uses.value }}
          <v-spacer />
          <v-btn
            v-if="context.creatureId"
            variant="text"
            color="primary"
            :disabled="!model.usesUsed || !context.editPermission"
            @click="resetUses"
          >
            {{ $t('viewers.resetButton') }}
          </v-btn>
        </template>
        <span v-else>
          <code>{{ model.uses.calculation }}</code>
        </span>
      </property-field>
      <property-field
        :name="$t('viewers.reset')"
        :value="reset"
      />
      <property-field
        v-if="model.resources?.conditions?.length"
        :name="$t('viewers.conditions')"
      >
        <div style="width: 100%;">
          <action-condition-view
            v-for="condition in model.resources?.conditions"
            :key="condition._id"
            class="action-child"
            :model="condition"
          />
        </div>
      </property-field>
      <property-field
        v-if="model.resources?.attributesConsumed?.length"
        :name="$t('viewers.attributesConsumed')"
      >
        <div style="width: 100%;">
          <attribute-consumed-view
            v-for="attributeConsumed in model.resources?.attributesConsumed"
            :key="attributeConsumed._id"
            class="action-child"
            :model="attributeConsumed"
          />
        </div>
      </property-field>
      <property-field
        v-if="model.resources?.itemsConsumed?.length"
        :name="$t('viewers.itemsConsumed')"
      >
        <div style="width: 100%;">
          <item-consumed-view
            v-for="itemConsumed in model.resources?.itemsConsumed"
            :key="itemConsumed._id"
            class="action-child"
            :model="itemConsumed"
            :action="model"
          />
        </div>
      </property-field>
      <slot />
      <property-description
        :name="$t('forms.summary')"
        :model="model.summary"
      />
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue';
import PropertyField from '/imports/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue';
import ActionConditionView from '/imports/ui/properties/components/actions/ActionConditionView.vue';
import AttributeConsumedView from '/imports/ui/properties/components/actions/AttributeConsumedView.vue';
import ItemConsumedView from '/imports/ui/properties/components/actions/ItemConsumedView.vue';
import PropertyIcon from '/imports/ui/properties/shared/PropertyIcon.vue';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
// Aliased: the template calls this component's own doAction()
import doActionApi from '/imports/ui/creature/actions/doAction';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { useI18n } from 'vue-i18n';
import resetMessage from '/imports/ui/properties/viewers/shared/resetMessage';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});
const dialogStackStore = useDialogStackStore();

const doActionLoading = ref(false);

const actionTypes = {
  action: t('forms.actionTypes.action'),
  bonus: t('forms.actionTypes.bonus'),
  attack: t('forms.actionTypes.attack'),
  reaction: t('forms.actionTypes.reaction'),
  free: t('forms.actionTypes.free'),
  long: t('forms.actionTypes.long'),
};

const targetTypes = {
  self: t('targets.self'),
  singleTarget: t('targets.singleTarget'),
  multipleTargets: t('targets.multipleTargets'),
};

const reset = computed(() => {
  const key = resetMessage(props.model.reset);
  return key && t(key);
});

const totalUses = computed(() => {
  if (!props.model.uses) return 0;
  return Math.max(props.model.uses.value || 0, 0);
});

const usesLeft = computed(() => {
  return Math.max(totalUses.value - (props.model.usesUsed || 0), 0);
});

// 'auto': the target picker opens by itself during a fight; 'always': "Target…"
async function doAction(chooseTargets) {
  if (props.model.type === 'spell') {
    return dialogStackStore.pushDialogStack({
      component: 'cast-spell-with-slot-dialog',
      elementId: 'cast-spell',
      data: {
        creatureId: props.model.root.id,
        spellId: props.model._id,
      },
    });
  }
  doActionLoading.value = true;
  await doActionApi({
    creatureId: props.model.root.id,
    propId: props.model._id,
    elementId: chooseTargets === 'always' ? 'target-action-button' : 'do-action-button',
    targetIds: [],
    chooseTargets,
  }).catch((e) => {
    console.error(e);
    snackbar({ text: e.message || e.reason || e.toString() });
  }).finally(() => {
    doActionLoading.value = false;
  });
}

async function resetUses() {
  await updateCreatureProperty.callAsync({
    _id: props.model._id,
    path: ['usesUsed'],
    value: 0,
  });
}
</script>

<style lang="css" scoped>

.action-child {
  height: 40px;
}
</style>
