<template>
  <div
    v-if="properties"
    class="stats-tab ma-2"
  >
    <div
      v-if="choicesLeft > 0"
      class="px-2 pt-2"
    >
      <!-- On a phone the action goes under the text, which a button beside it squeezed into a column -->
      <v-alert
        type="info"
        variant="tonal"
        density="compact"
        icon="mdi-hammer-wrench"
        data-id="build-incomplete"
      >
        {{ $t('build.incomplete', { count: choicesLeft }, choicesLeft) }}
        <template v-if="buildProgress?.next">
          {{ $t('build.nextStep', { name: buildProgress.next.name }) }}
        </template>
        <div
          v-if="xs"
          class="mt-1 ms-n2"
        >
          <v-btn
            variant="text"
            size="small"
            append-icon="mdi-arrow-right"
            @click="appStore.setTabForCharacterSheet({ id: creatureId, tab: 'build' })"
          >
            {{ $t('build.continueBuilding') }}
          </v-btn>
        </div>
        <template
          v-if="!xs"
          #append
        >
          <v-btn
            variant="text"
            size="small"
            append-icon="mdi-arrow-right"
            @click="appStore.setTabForCharacterSheet({ id: creatureId, tab: 'build' })"
          >
            {{ $t('build.continueBuilding') }}
          </v-btn>
        </template>
      </v-alert>
    </div>
    <your-turn-banner
      :creature-id="creatureId"
      class="mx-2 mt-2"
    />
    <!--
      The fight at a glance (D1). On a phone its first row (hit points, armor
      class, initiative) stays under the app bar while the tab scrolls
    -->
    <template v-if="xs">
      <div class="combat-summary-sticky px-2 pt-2">
        <combat-summary
          :creature-id="creatureId"
          part="primary"
        />
      </div>
      <combat-summary
        :creature-id="creatureId"
        part="secondary"
        class="mx-2 mt-2"
      />
    </template>
    <combat-summary
      v-else
      :creature-id="creatureId"
      class="mx-2 mt-2"
    />
    <div
      v-if="otherHealthBars.length"
      class="px-2 pt-2"
    >
      <v-card class="pa-2">
        <health-bar
          v-for="healthBar in otherHealthBars"
          :key="healthBar._id"
          :model="healthBar"
          @change="change => changeHealth(healthBar, change)"
          @click="clickProperty({_id: healthBar._id})"
        />
      </v-card>
    </div>

    <column-layout>
      <folder-group-card
        v-for="folder in properties.folder.start"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />
      <div
        v-if="!creature.settings?.hideRestButtons || (properties.action && properties.action.event && properties.action.event.length)"
        class="character-buttons"
      >
        <v-card>
          <!-- The rests side by side, the events under them (D5) -->
          <v-card-text class="character-buttons__grid">
            <rest-button
              v-if="!creature.settings?.hideRestButtons"
              class="character-buttons__rest"
              :creature-id="creatureId"
              type="shortRest"
            />
            <rest-button
              v-if="!creature.settings?.hideRestButtons"
              class="character-buttons__rest"
              :creature-id="creatureId"
              type="longRest"
            />
            <event-button
              v-for="event in properties.event"
              :key="event._id"
              :model="event"
            />
          </v-card-text>
        </v-card>
      </div>

      <folder-group-card
        v-for="folder in properties.folder.events"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />

      <damage-multiplier-card
        v-if="properties.damageMultiplier && properties.damageMultiplier.length"
        :multipliers="properties.damageMultiplier"
        @click-multiplier="clickProperty"
      />

      <div
        v-if="(properties.buff && properties.buff.length) || conditions.length"
        class="buffs"
      >
        <v-card>
          <!-- The chips come first: a buff added to the list must not move them under the pointer -->
          <!-- Not a list of its own: a list without items is invalid for screen readers -->
          <v-list-subheader class="pt-2 px-4">
            {{ $t('stats.buffsAndConditions') }}
          </v-list-subheader>
          <!-- From md, every condition; below, those it has and a menu for the others (UX10) -->
          <condition-chips
            v-if="conditions.length"
            class="px-4 pt-1 pb-3"
            :creature-id="creatureId"
            :conditions="conditions"
            :buffs="properties.buff"
            :layout="mdAndUp ? 'all' : 'active'"
          />
          <!--
            A buff that arrives is tinted for a moment, one that ends fades
            out (A6). Not when the sheet loads, and nothing moves: the list is
            in a column layout
          -->
          <v-list
            v-if="buffListShown"
            class="pt-0"
          >
            <transition-group
              :name="buffsAnimated ? 'buff-change' : 'buff-still'"
              :appear="buffsAnimated"
            >
              <buff-list-item
                v-for="buff in properties.buff"
                :key="buff._id"
                :data-id="buff._id"
                :model="buff"
                @click="clickProperty({_id: buff._id})"
                @remove="softRemove(buff._id)"
              />
            </transition-group>
          </v-list>
        </v-card>
      </div>

      <div
        v-if="properties.attribute.ability && properties.attribute.ability.length"
        class="ability-scores"
      >
        <v-card>
          <v-list>
            <template
              v-for="ability in properties.attribute.ability"
              :key="ability._id"
            >
              <ability-list-tile
                :model="ability"
                :data-id="ability._id"
                @click="clickProperty({_id: ability._id})"
              />
            </template>
          </v-list>
        </v-card>
      </div>

      <div
        v-for="toggle in properties.toggle"
        :key="toggle._id"
        class="toggle"
      >
        <toggle-card
          :model="toggle"
          :data-id="toggle._id"
          @click="clickProperty({_id: toggle._id})"
        />
      </div>

      <div
        v-for="stat in listed(properties.attribute.stat)"
        :key="stat._id"
        class="stat"
      >
        <attribute-card
          :model="stat"
          :data-id="stat._id"
          @click="clickProperty({_id: stat._id})"
        />
      </div>

      <div
        v-for="modifier in listed(properties.attribute.modifier)"
        :key="modifier._id"
        class="modifier"
      >
        <attribute-card
          :model="modifier"
          :data-id="modifier._id"
          @click="clickProperty({_id: modifier._id})"
        />
      </div>

      <div
        v-for="check in listed(properties.skill.check)"
        :key="check._id"
        class="check"
      >
        <attribute-card
          modifier
          :model="check"
          :data-id="check._id"
          @click="clickProperty({_id: check._id})"
        />
      </div>

      <div
        v-if="properties.attribute.hitDice && properties.attribute.hitDice.length"
        class="hit-dice"
      >
        <v-card>
          <v-list>
            <v-list-subheader>{{ $t('stats.hitDice') }}</v-list-subheader>
            <template
              v-for="hitDie in properties.attribute.hitDice"
              :key="hitDie._id"
            >
              <hit-dice-list-tile
                :model="hitDie"
                :data-id="hitDie._id"
                @click="clickProperty({_id: hitDie._id})"
                @change="e => incrementChange(hitDie._id, e)"
              />
            </template>
          </v-list>
        </v-card>
      </div>

      <div
        v-for="resource in properties.attribute.resource"
        :key="resource._id"
        class="resource"
      >
        <resource-card
          :model="resource"
          :data-id="resource._id"
          @click="clickProperty({_id: resource._id})"
          @change="e => incrementChange(resource._id, e)"
        />
      </div>

      <div
        v-if="properties.attribute.spellSlot && properties.attribute.spellSlot.length"
        class="spell-slots"
      >
        <spell-slot-card
          :creature-id="creatureId"
          :spell-slots="properties.attribute.spellSlot"
        />
      </div>

      <folder-group-card
        v-for="folder in properties.folder.stats"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />

      <div
        v-if="properties.skill.save && properties.skill.save.length"
        class="saving-throws"
      >
        <v-card>
          <v-list>
            <v-list-subheader>{{ $t('stats.savingThrows') }}</v-list-subheader>
            <skill-list-tile
              v-for="save in properties.skill.save"
              :key="save._id"
              :model="save"
              :data-id="save._id"
              @click="clickProperty({_id: save._id})"
            />
            <v-list-item
              v-for="(effect, index) in saveConditionals"
              :key="effect._id"
              :data-id="effect._id"
              :class="{'mt-2': !index}"
              @click="clickProperty({_id: effect._id})"
            >
              <v-list-item-subtitle style="white-space: unset;">
                {{ effect.text }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>
      </div>

      <div
        v-if="properties.skill.skill && properties.skill.skill.length"
        class="skills"
      >
        <v-card>
          <v-list>
            <v-list-subheader>{{ $t('stats.skills') }}</v-list-subheader>
            <skill-list-tile
              v-for="skill in properties.skill.skill"
              :key="skill._id"
              :model="skill"
              :data-id="skill._id"
              @click="clickProperty({_id: skill._id})"
            />
            <v-list-item
              v-for="(effect, index) in skillConditionals"
              :key="effect._id"
              :data-id="effect._id"
              :class="{'mt-2': !index}"
              @click="clickProperty({_id: effect._id})"
            >
              <v-list-item-subtitle style="white-space: unset;">
                {{ effect.text }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>
      </div>

      <folder-group-card
        v-for="folder in properties.folder.skills"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />

      <div
        v-if="properties.skill.weapon && properties.skill.weapon.length"
        class="weapon-proficiencies"
      >
        <v-card>
          <v-list>
            <v-list-subheader>
              {{ $t('stats.weapons') }}
            </v-list-subheader>
            <skill-list-tile
              v-for="weapon in properties.skill.weapon"
              :key="weapon._id"
              hide-modifier
              :model="weapon"
              :data-id="weapon._id"
              @click="clickProperty({_id: weapon._id})"
            />
          </v-list>
        </v-card>
      </div>
      <div
        v-if="properties.skill.armor && properties.skill.armor.length"
        class="armor-proficiencies"
      >
        <v-card>
          <v-list>
            <v-list-subheader>
              {{ $t('stats.armor') }}
            </v-list-subheader>
            <skill-list-tile
              v-for="armor in properties.skill.armor"
              :key="armor._id"
              hide-modifier
              :model="armor"
              :data-id="armor._id"
              @click="clickProperty({_id: armor._id})"
            />
          </v-list>
        </v-card>
      </div>
      <div
        v-if="properties.skill.tool && properties.skill.tool.length"
        class="tool-proficiencies"
      >
        <v-card>
          <v-list>
            <v-list-subheader>
              {{ $t('stats.tools') }}
            </v-list-subheader>
            <skill-list-tile
              v-for="tool in properties.skill.tool"
              :key="tool._id"
              hide-modifier
              :model="tool"
              :data-id="tool._id"
              @click="clickProperty({_id: tool._id})"
            />
          </v-list>
        </v-card>
      </div>
      <div
        v-if="properties.skill.language && properties.skill.language.length"
        class="language-proficiencies"
      >
        <v-card>
          <v-list>
            <v-list-subheader>
              {{ $t('stats.languages') }}
            </v-list-subheader>
            <skill-list-tile
              v-for="language in properties.skill.language"
              :key="language._id"
              hide-modifier
              :model="language"
              :data-id="language._id"
              @click="clickProperty({_id: language._id})"
            />
          </v-list>
        </v-card>
      </div>

      <folder-group-card
        v-for="folder in properties.folder.proficiencies"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />

      <folder-group-card
        v-for="folder in properties.folder.end"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />
    </column-layout>
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DURATION } from '/imports/ui/utility/motion';
import { autorun } from 'vue-meteor-tracker';
import Creatures from '/imports/api/creature/creatures/Creatures';
import softRemoveProperty from '/imports/api/creature/creatureProperties/methods/softRemoveProperty';
import HealthBar from '/imports/ui/properties/components/attributes/HealthBar.vue';
import AttributeCard from '/imports/ui/properties/components/attributes/AttributeCard.vue';
import AbilityListTile from '/imports/ui/properties/components/attributes/AbilityListTile.vue';
import ColumnLayout from '/imports/ui/components/ColumnLayout.vue';
import DamageMultiplierCard from '/imports/ui/properties/components/damageMultipliers/DamageMultiplierCard.vue';
import HitDiceListTile from '/imports/ui/properties/components/attributes/HitDiceListTile.vue';
import SkillListTile from '/imports/ui/properties/components/skills/SkillListTile.vue';
import ResourceCard from '/imports/ui/properties/components/attributes/ResourceCard.vue';
import RestButton from '/imports/ui/creature/RestButton.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import ToggleCard from '/imports/ui/properties/components/toggles/ToggleCard.vue';
import BuffListItem from '/imports/ui/properties/components/buffs/BuffListItem.vue';
import ConditionChips from '/imports/ui/properties/components/buffs/ConditionChips.vue';
import listConditions from '/imports/api/creature/creatureProperties/methods/listConditions';
import SpellSlotCard from '/imports/ui/properties/components/attributes/SpellSlotCard.vue';
import EventButton from '/imports/ui/properties/components/actions/EventButton.vue';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import FolderGroupCard from '/imports/ui/properties/components/folders/FolderGroupCard.vue';
import { get, set, uniqBy } from 'lodash';
import { docsToForest, getFilter } from '/imports/api/parenting/parentingFunctions';
import doAction from '/imports/ui/creature/actions/doAction';
import applyHealthChange from '/imports/ui/creature/actions/applyHealthChange';
import getPropertyTitle from '/imports/ui/properties/shared/getPropertyTitle';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { useAppStore } from '/imports/ui/stores/app';
import useBuildProgress from '/imports/ui/composables/useBuildProgress';
import useCombatStats from '/imports/ui/composables/useCombatStats';
import CombatSummary from '/imports/ui/creature/character/CombatSummary.vue';
import YourTurnBanner from '/imports/ui/creature/character/YourTurnBanner.vue';
import { useDisplay } from 'vuetify';

const dialogStackStore = useDialogStackStore();
const appStore = useAppStore();

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});



// A character still being built says so, rather than showing a sheet of -5s.
// Only to those who can build it
const context = inject('context', {});
const buildProgress = useBuildProgress(() => props.creatureId);
const { xs, mdAndUp } = useDisplay();

// Buffs animate in and out once the sheet has loaded them and shown them:
// the list of the first buff then appears with it
const settled = ref(false);
onMounted(() => requestAnimationFrame(() => { settled.value = true; }));
const buffsAnimated = computed(() => settled.value && appStore.loadedCharacterId === props.creatureId);

// What the combat summary shows is not repeated in the cards below it
const combatStats = useCombatStats(() => props.creatureId);
const inSummary = computed(() => {
  const s = combatStats.value;
  return new Set([s.hitPoints, s.armor, s.initiative, s.speed, s.proficiencyBonus]
    .filter(Boolean).map(prop => prop._id));
});
const listed = list => (list || []).filter(prop => !inSummary.value.has(prop._id));
const otherHealthBars = computed(() => listed(properties.value?.attribute.healthBar));
// Steps left, locked ones included, while one of them can be done now (UX12)
const choicesLeft = computed(() => context.editPermission === false || !buildProgress.value?.left
  ? 0
  : buildProgress.value.total - buildProgress.value.done);

const creature = autorun(() => {
  return Creatures.findOne(props.creatureId, { fields: { settings: 1 } });
}).result;

// The conditions its editors can give the character in one click
const conditions = ref([]);
watch(() => context.editPermission && props.creatureId, async (creatureId) => {
  conditions.value = [];
  if (!creatureId) return;
  try {
    const result = await listConditions.callAsync({ creatureId });
    if (creatureId === props.creatureId) conditions.value = result || [];
  } catch (error) {
    console.error(error);
  }
}, { immediate: true });

function walkDown(forest, callback){
  let stack = [...forest].reverse();
  while(stack.length){
    let node = stack.pop();
    const { skipChildren } = callback(node) ?? { skipChildren: false };
    if (!skipChildren) {
      stack.push(...[...node.children].reverse());
    }
  }
}

const propertyHandlers = {
  folder(prop) {
    let propPath = null;
    if (prop.groupStats && prop.tab === 'stats') {
      propPath = ['folder', prop.location]
    }
    return { propPath }
  },
  attribute(prop) {
    if (
      prop.attributeType === 'utility' ||
      prop.overridden ||
      (prop.hideWhenTotalZero && prop.total === 0) ||
      (prop.hideWhenValueZero && prop.value === 0)
    ) return { propPath: null };
    return {
      propPath: ['attribute', prop.attributeType],
    }
  },
  skill(prop) {
    if (
      prop.skillType === 'utility'
    ) return { propPath: null };
    return {
      propPath: ['skill', prop.skillType],
    }
  },
  toggle(prop) {
    if (
      prop.deactivatedByToggle || prop.deactivatedByAncestor || !prop.showUI
    ) return { propPath: null };
    return { propPath: 'toggle' };
  },
  action(prop) {
    if (prop.actionType === 'event' && !prop.overridden) {
      return { propPath: 'event' };
    }
    return { propPath: null };
  },
}

const properties = autorun(() => {
  const c = creature.value;
  if (!c) return;
  const folderIds = CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    type: 'folder',
    groupStats: true,
    hideStatsGroup: true,
    removed: { $ne: true },
    inactive: { $ne: true },
  }, { fields: { _id: 1 } }).map(folder => folder._id);

  const filter = {
    ...getFilter.descendantsOfRoot(props.creatureId),
    parentId: {
      $nin: folderIds,
    },
    $or: [
      { inactive: { $ne: true } },
      { type: 'toggle' },
    ],
    overridden: {$ne: true},
    removed: { $ne: true },
    type: {
      $in: [
        'action',
        'attribute',
        'buff',
        'damageMultiplier',
        'folder',
        'skill',
        'toggle',
      ]
    }
  };
  // The sidebar's character list publishes the character without its settings,
  // which may reach the sheet before its own subscription does
  if (c.settings?.hideUnusedStats) {
    filter.hide = { $ne: true };
  }
  const allProps = CreatureProperties.find(filter, { sort: { left: 1 } }).fetch();
  const forest = docsToForest(allProps);
  const propertiesObj = { folder: {}, attribute: {}, skill: {} };
  walkDown(forest, node => {
    const prop = node.doc
    const { propPath, skipChildren } = propertyHandlers[prop.type]?.(prop) ||
      { propPath: prop.type };
    if (propPath) {
      let propArray = get(propertiesObj, propPath);
      if (!propArray) {
        propArray = [];
        set(propertiesObj, propPath, propArray);
      }
      propArray.push(prop);
    }
    return { skipChildren };
  });
  propertiesObj.damageMultiplier?.sort((a, b) => a.value - b.value);
  return propertiesObj;
}).result;

// The list outlives its last buff while that one fades out
const buffListShown = ref(false);
let buffListTimer;
watch(() => properties.value?.buff?.length || 0, count => {
  clearTimeout(buffListTimer);
  if (count) buffListShown.value = true;
  else buffListTimer = setTimeout(() => { buffListShown.value = false; }, DURATION.medium + 50);
}, { immediate: true });
onBeforeUnmount(() => clearTimeout(buffListTimer));


const saveConditionals = computed(() => {
  const conditionals = [];
  properties.value?.skill?.save?.forEach(prop => {
    prop?.effects?.forEach(effect => {
      if (effect.operation === 'conditional') {
        conditionals.push(effect);
      }
    });
  });
  return uniqBy(conditionals, '_id');
});

const skillConditionals = computed(() => {
  const conditionals = [];
  properties.value?.skill?.skill?.forEach(prop => {
    prop?.effects?.forEach(effect => {
      if (effect.operation === 'conditional') {
        conditionals.push(effect);
      }
    });
  });
  return uniqBy(conditionals, '_id');
});

function clickProperty({ _id }) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${_id}`,
    data: { _id },
  });
}

function clickTreeProperty({ _id }) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `tree-node-${_id}`,
    data: { _id },
  });
}

// Damage and healing through the engine, or the bar set (UX1)
function changeHealth(model, change) {
  applyHealthChange({ model, ...change }).catch(error => {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  });
}

async function incrementChange(_id, { type, value, ack }) {
  const model = CreatureProperties.findOne(_id);
  if (!model) return;
  if (type === 'increment') value = -value;
  await doAction({
    creatureId: model.root.id,
    elementId: `${model._id}`,
    task: {
      subtaskFn: 'damageProp',
      targetIds: [model.root.id],
      params: {
        title: getPropertyTitle(model),
        operation: type,
        value,
        targetProp: model,
      },
    },
  }).then(() =>{
    ack?.();
  }).catch((error) => {
    if (ack) {
      ack(error);
    } else  {
      snackbar({ text: error.reason || error.message || error.toString() });
      console.error(error);
    }
  });
}

async function softRemove(_id) {
  try {
    await softRemoveProperty.callAsync({ _id });
  } catch (error) {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  }
}
</script>

<style scoped>
/* Rules between list items: a v-divider is an <hr>, which a list may not hold */
.ability-scores .v-list-item + .v-list-item,
.hit-dice .v-list-item + .v-list-item {
  border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

/* Rests side by side, events under them */
.character-buttons__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.character-buttons__grid > :not(.character-buttons__rest) {
  grid-column: 1 / -1;
}

/* A buff that arrives: tinted, then the tint fades (600ms); one that ends fades out */
.buff-change-enter-active {
  animation: buff-arrive 600ms var(--motion-easing-standard);
}

.buff-change-leave-active {
  transition: opacity var(--motion-duration-medium) var(--motion-easing-emphasized-accelerate);
}

.buff-change-leave-to {
  opacity: 0;
}

@keyframes buff-arrive {
  0%, 40% {
    background-color: rgba(var(--v-theme-primary), 0.16);
  }
  100% {
    background-color: transparent;
  }
}

.reduce-motion .buff-change-enter-active {
  animation-duration: 600ms;
}

.reduce-motion .buff-change-leave-active {
  transition-duration: var(--motion-duration-short);
}

/* On a phone the combat summary's first row stays under the app bar */
.combat-summary-sticky {
  position: sticky;
  top: var(--v-layout-top);
  z-index: 3;
  background: rgb(var(--v-theme-page));
  padding-bottom: 8px;
}
</style>
