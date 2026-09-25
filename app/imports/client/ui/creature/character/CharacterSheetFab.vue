<template>
  <!--
    Vuetify 3's speed dial is a menu and renders no element of its own, so this
    root carries the class and positioning Vuetify 2's speed dial used to.
  -->
  <div
    class="character-sheet-fab"
    :class="{ 'character-sheet-fab--fixed': fixed }"
    :style="!speedDials ? 'visibility: hidden;' : ''"
  >
    <v-speed-dial
      v-model="fab"
      :location="`${direction} center`"
      transition="scale-transition"
    >
      <template #activator="{ props: activatorProps }">
        <!-- elevated: the toolbar this sits in defaults its buttons to `text` -->
        <v-btn
          v-bind="activatorProps"
          color="primary"
          variant="elevated"
          icon
          size="small"
          data-id="insert-creature-property-fab"
          class="insert-creature-property-fab"
        >
          <v-icon
            style="transition: transform 0.2s ease-in-out"
            :style="fab && 'transform: rotate(45deg)'"
          >
            mdi-plus
          </v-icon>
        </v-btn>
      </template>
      <labeled-fab
        v-for="type in speedDials"
        :key="type"
        color="primary"
        :data-id="`insert-creature-property-type-${type}`"
        :label="getPropertyLabel(type)"
        :icon="type ? properties[type].icon : 'mdi-plus'"
        :disabled="!editPermission"
        @click="addProperty(type)"
      />
    </v-speed-dial>
  </div>
</template>

<script setup>
  import { ref, computed, toRefs } from 'vue';
  import { useRoute } from 'vue-router';

  import LabeledFab from '/imports/client/ui/components/LabeledFab.vue';
  import insertProperty from '/imports/api/creature/creatureProperties/methods/insertProperty';
  import PROPERTIES from '/imports/constants/PROPERTIES';
  import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
  import { fetchDocByRef } from '/imports/api/parenting/parentingFunctions';
  import { useAppStore } from '/imports/client/ui/piniaAppStore';
  import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

  const props = defineProps({
    editPermission: Boolean,
    // Which way the dial opens: 'top' or 'bottom'
    direction: {
      type: String,
      default: 'top',
    },
    // Pinned to the bottom right of the viewport
    fixed: Boolean,
  });
  const { direction, fixed } = toRefs(props);

  const fab = ref(false);

  const route = useRoute();

  const creatureId = computed(() => route.params.id);
  const tabName = computed(() => appStore.tabNameById(creatureId.value));
  
  const speedDialsByTab = computed(() => ({
    'stats': ['attribute', 'skill', 'buff'],
    'features': ['feature'],
    'spells': ['spellList', 'spell'],
    'actions': ['action'],
    'inventory': ['item', 'container'],
    'journal': ['note'],
    'tree': [null],
  }));

  const speedDials = computed(() => speedDialsByTab.value[tabName.value]);
  const properties = computed(() => PROPERTIES);


  function getParentFromSelectedTreeNode(creatureId) {
    // find the parent based on the currently selected property
    let el = document.querySelector('.tree-tab .tree-node-title.text-primary');
    let selectedComponent = el && el.parentElement.__vue__.$parent;
    let parentRef;
    const onTreeTab = appStore.tabNameById(creatureId) === 'tree';
    if (onTreeTab && selectedComponent) {
      if (selectedComponent.showExpanded) {
        parentRef = {
          id: selectedComponent.node._id,
          collection: 'creatureProperties',
        };
      } else {
        parentRef = selectedComponent.node.parent;
      }
    } else {
      parentRef = { collection: 'creatures', id: creatureId };
    }
    return parentRef;
  }

  function hideFab() {
    let fabEl = document.querySelector('.insert-creature-property-fab');
    if (fabEl) fabEl.style.opacity = '0';
    return fabEl;
  }

  function revealFab(fabEl) {
    if (!fabEl) return;
    // Bring back the fab with scale up animation
    fabEl.style.transition = 'none';
    fabEl.style.opacity = '';
    fabEl.style.transform = 'scale(0)';
    setTimeout(() => {
      fabEl.style.transform = '';
      fabEl.style.transition = '';
    }, 400);
  }

  function getPropertyLabel(type) {
    if (type === 'buff') return t('sheet.buffOrCondition');
    return type ? getPropertyName(type) : t('common.property');
  }

  async function addProperty(forcedType) {
    let currentCreatureId = creatureId.value;
    let fabEl = hideFab();

    let parentRef = getParentFromSelectedTreeNode(currentCreatureId);
    let parent;
    try {
      parent = await fetchDocByRef(parentRef);
    } catch (e) {
      console.warn(e);
    }

    dialogStackStore.pushDialogStack({
      component: 'insert-property-dialog',
      elementId: 'insert-creature-property-type-' + forcedType,
      data: {
        parentDoc: forcedType ? undefined : parent,
        forcedType,
        creatureId: currentCreatureId,
        noBackdropClose: true,
      },
      async callback(result) {
        if (!result) {
          return 'insert-creature-property-fab';
        }
        if (Array.isArray(result)) {
          revealFab(fabEl);
          let nodeIds = result;
          let id = await insertPropertyFromLibraryNode.callAsync({ nodeIds, parentRef });
          return forcedType ? id : `tree-node-${id}`;
        } else {
          revealFab(fabEl);
          let creatureProperty = result;
          // Insert the property
          let id = await insertProperty.callAsync({ creatureProperty, parentRef });
          return forcedType ? id : `tree-node-${id}`;
        }
      }
    });
  }
</script>

<style lang="css" scoped>
  .insert-creature-property-fab {
    transition: transform 0.07s cubic-bezier(0.5, 0.2, 0.8, 0.4) 0s;
  }
  /* :where() keeps these defaults weaker than a parent's own class */
  :where(.character-sheet-fab) {
    position: relative;
    z-index: 1;
  }
  :where(.character-sheet-fab--fixed) {
    position: fixed;
    z-index: 1010;
    bottom: 16px;
    right: 16px;
  }
</style>
