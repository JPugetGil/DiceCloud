<template>
  <dialog-base class="dependency-graph">
    <template #toolbar>
      <div>
        Dependency Graph
      </div>
    </template>
    <template #unwrapped-content>
      <div
        id="dependency-graph-container"

        ref="container"
        class="graph-container"
      />
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import buildCreatureComputation from '/imports/api/engine/computation/buildCreatureComputation';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import computeCreatureComputation from '/imports/api/engine/computation/computeCreatureComputation';
import cytoscape from 'cytoscape';
import klay from 'cytoscape-klay';
import PROPERTIES from '/imports/constants/PROPERTIES';
import themes from '/imports/client/ui/themes';

// The graph is drawn on a dark canvas in both themes: it takes the dark theme's roles
const dark = themes.dark.colors;

cytoscape.use(klay);

function getNodeName(node) {
  let model = node.data;
  if (!model) return node.id;
  if (model.name) return model.name;
  if (model.type === '_calculation') {
    return model._key;
  }
  let prop = PROPERTIES[model.type]
  if (model.type === 'classLevel' && model.name && model.level) {
    return model.name + ' ' + model.level
  }
  return prop?.name || prop?.type || node.id;
}

function getLoopNodes(computation) {
  const loopNodes = [];
  if (!computation.errors) return loopNodes;
  computation.errors.forEach(err => {
    if (err.type !== 'dependencyLoop') return;
    err.details?.nodes?.forEach(nodeId => loopNodes.push(nodeId));
  });
  return loopNodes;
}

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const container = ref(null);
let cy;

onMounted(async () => {
  // Computed here rather than in a meteor: property, which cannot be async.
  // Only mount reads it, so it never needed to be reactive.
  const computation = await buildCreatureComputation(props.creatureId);
  await computeCreatureComputation(computation);
  // Convert ngraph to cytoscape
  // Convert Nodes
  const nodes = [];
  const loopNodes = getLoopNodes(computation);
  computation.dependencyGraph.forEachNode(function (node) {
    nodes.push({
      data: {
        id: node.id,
        label: getNodeName(node) || node.id,
        variable: !node.data?.type,
        inLoop: loopNodes.includes(node.id),
        propId: node.data?._id,
        prop: node.data,
      },
    });
  });
  // Convert edges
  const edges = [];
  computation.dependencyGraph.forEachLink(function (link) {
    edges.push({
      data: {
        target: link.fromId,
        source: link.toId,
        linkType: link.data,
        inLoop: loopNodes.includes(link.fromId) && loopNodes.includes(link.toId),
      },
    });
    //{ data: { source: 'n0', target: 'n1' } }
  });
  cy = cytoscape({
    container: container.value,

    boxSelectionEnabled: false,
    autounselectify: true,

    layout: {
      name: 'klay',
      nodeDimensionsIncludeLabels: false,
      klay: {
        addUnnecessaryBendpoints: false,
        aspectRatio: 1.6,
        direction: 'RIGHT',
        edgeRouting: 'ORTHOGONAL', //'ORTHOGONAL',
        edgeSpacingFactor: 0.5,
        feedbackEdges: true,
        inLayerSpacingFactor: 1.0,
        layoutHierarchy: true,
        linearSegmentsDeflectionDampening: 0.3,
        compactComponents: true,
        mergeEdges: false,
        mergeHierarchyCrossingEdges: false,
        nodeLayering: 'NETWORK_SIMPLEX',
        nodePlacement: 'LINEAR_SEGMENTS', //default 'BRANDES_KOEPF'
        spacing: 20,//20,
        thoroughness: 12,//7,
        separateConnectedComponents: true,
      },
    },

    style: [
      {
        selector: 'node',
        style: {
          'content': 'data(label)',
          //'text-opacity': 0.8,
          'text-valign': 'center',
          'text-halign': 'center',
          'background-color': dark.surface,
          'text-background-color': dark.surface,
          'color': '#fff',
          //'text-outline-color': '#888',
          //'text-outline-width': 3,
          'text-background-opacity': 1,
          'text-background-shape': 'roundrectangle',
          'text-background-padding': 2,
          'shape': 'round-rectangle',
          'width': 80,
          'height': 20,
          'compound-sizing-wrt-labels': 'include',
          'font-family': '"Roboto",sans-serif',
        }
      }, {
        selector: ele => ele.data().variable,
        style: {
          'color': dark.primary,
          'font-family': 'monospace',
        }
      }, {
        selector: ele => !!ele.data().propId,
        style: {
          'color': dark['on-primary-container'],
          'background-color': dark['primary-container'],
          'text-background-color': dark['primary-container'],
        }
      }, {
        selector: 'edge',
        style: {
          'width': 4,
          'target-arrow-shape': 'triangle-backcurve',
          'color': '#fff',
          'text-opacity': 0.8,
          // Lines need 3:1 against the canvas: #555 was 2.4:1, this is 6.8:1
          'line-color': '#9E9E9E',
          'target-arrow-color': '#9E9E9E',
          'curve-style': 'unbundled-bezier',//'unbundled-bezier',
          'label': 'data(linkType)',
          'text-rotation': 'autorotate',
          'source-endpoint': 'outside-to-line-or-label',
          'target-endpoint': 'outside-to-line-or-label',
        }
      }, {
        selector: ele => ele.data().inLoop,
        style: {
          'color': dark['on-error-container'],
          'background-color': dark['error-container'],
          'text-background-color': dark['error-container'],
          'line-color': dark.error,
          'target-arrow-color': dark.error,
        }
      },
    ],

    elements: {
      nodes,
      edges,
    },
  });
  cy.on('tap', 'node', function(evt){
    var node = evt.target;
    console.log( node.data() );
  });
  cy.on('tap', 'edge', function(evt){
    var edge = evt.target;
    console.log( edge.data() );
  });
});

onUnmounted(() => {
  cy?.destroy();
});
</script>

<style lang="css">
  .graph-container {
    width: 100%;
    height: 100%;
    background-color: #151515;
  }

  .graph-container svg {
    width: 100%;
    height: 100%;
  }
</style>