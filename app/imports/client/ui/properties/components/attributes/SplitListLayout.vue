<template>
  <div
    v-if="smAndUp"
    class="d-flex flex-1-1 split"
  >
    <v-list
      class="float-left"
      lines="two"
      density="compact"
    >
      <v-slide-x-transition
        group
        leave-absolute
      >
        <slot name="left" />
      </v-slide-x-transition>
    </v-list>
    <v-divider
      class="mx-3"
      vertical
    />
    <v-list
      class="float-right"
      lines="two"
      density="compact"
    >
      <v-slide-x-transition
        group
        leave-absolute
      >
        <slot name="right" />
      </v-slide-x-transition>
    </v-list>
  </div>
  <v-list
    v-else
    class="small"
    lines="two"
    density="compact"
  >
    <v-slide-x-transition
      group
      leave-absolute
    >
      <slot name="left" />
      <slot name="right" />
    </v-slide-x-transition>
  </v-list>
</template>

<script setup>
import { useDisplay } from 'vuetify';

const { smAndUp } = useDisplay();
</script>

<style lang="css" scoped>
.split{
  height: 100%;
}
.left, .right {
  height: 100%;
  overflow: auto;
  flex-basis: 250px;
}
.right, .small {
  flex-grow: 1;
}
</style>
