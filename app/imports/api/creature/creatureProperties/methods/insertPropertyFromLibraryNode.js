import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import { RefSchema } from '/imports/api/parenting/ChildSchema';
import getRootCreatureAncestor from '/imports/api/creature/creatureProperties/getRootCreatureAncestor';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import {
  renewDocIds,
  fetchDocByRef,
  rebuildNestedSets,
  getFilter
} from '/imports/api/parenting/parentingFunctions';
import { union } from 'lodash';
import batchInsertAsync from '/imports/api/utility/batchInsertAsync';

const insertPropertyFromLibraryNode = new ValidatedMethod({
  name: 'creatureProperties.insertPropertyFromLibraryNode',
  validate: new SimpleSchema({
    nodeIds: {
      type: Array,
      max: 20,
    },
    'nodeIds.$': {
      type: String,
      max: 32,
    },
    parentRef: {
      type: RefSchema,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ nodeIds, parentRef }) {
    // get the new ancestry for the properties
    const parentDoc = await fetchDocByRef(parentRef);

    // Check permission to edit
    let rootCreature;
    if (parentRef.collection === 'creatures') {
      rootCreature = parentDoc;
    } else if (parentRef.collection === 'creatureProperties') {
      rootCreature = await getRootCreatureAncestor(parentDoc);
    } else {
      throw `${parentRef.collection} is not a valid parent collection`
    }
    await assertEditPermission(rootCreature, this.userId);

    // Where the copies go: every copy belongs to the creature, and the copied
    // subtree hangs off the parent property, or sits at the top level (no
    // parentId) when inserted straight onto the creature
    const root = { collection: 'creatures', id: rootCreature._id };
    const parentId = parentRef.collection === 'creatureProperties' ? parentRef.id : undefined;

    let node;
    // for...of rather than forEach: an async callback handed to forEach is never
    // awaited, so `node` was still unset and the inserts had not landed before
    // rebuildNestedSets ran below.
    for (const nodeId of nodeIds) {
      node = await insertPropertyFromNode(nodeId, root, parentId);
    }

    // Tree structure changed by inserts, reorder the tree
    await rebuildNestedSets(CreatureProperties, rootCreature._id);

    // get one of the root inserted docs
    const lastInsertedId = node?._id;
    return lastInsertedId;
  },
});

async function insertPropertyFromNode(nodeId, root, parentId) {
  // Fetch the library node and its descendants, provided they have not been
  // removed
  let node = await LibraryNodes.findOneAsync({
    _id: nodeId,
    removed: { $ne: true },
  });
  if (!node) {
    if (Meteor.isClient) return {};
    else {
      throw new Meteor.Error(
        'Insert property from library failed',
        `No library document with id '${nodeId}' was found`
      );
    }
  }

  let nodes = await LibraryNodes.find({
    ...getFilter.descendants(node),
    removed: { $ne: true },
  }).fetchAsync();

  // The root node is first in the array of nodes
  // It must get the first generated ID to prevent flickering
  nodes = [node, ...nodes];

  // Convert all references into actual nodes
  nodes = await reifyNodeReferences(nodes);
  // Refetch the root node, it might have been reified
  node = nodes[0] || node;

  // set libraryNodeIds
  storeLibraryNodeReferences(nodes);

  // Give the docs new IDs without breaking internal references
  renewDocIds({
    docArray: nodes,
    collectionMap: { 'libraryNodes': 'creatureProperties' }
  });

  // Move the copies from the library onto the creature. renewDocIds only remaps
  // ids inside the copied set, so each copy still named its library as root and
  // the top node still named its library parent: the copies were inserted but
  // never appeared on the creature. Before the nested-set migration
  // (e4590de3) setLineageOfDocs did this; the migration computed root and
  // parentId for it but never applied them.
  for (const doc of nodes) {
    doc.root = { ...root };
  }
  if (parentId) {
    node.parentId = parentId;
  } else {
    delete node.parentId;
  }

  // Mark root node as dirty
  node.dirty = true;

  // Move the root node to the end of the order
  node.left = Number.MAX_SAFE_INTEGER;

  // Insert the creature properties
  await batchInsertAsync(CreatureProperties, nodes);
  return node;
}

export function storeLibraryNodeReferences(nodes) {
  nodes.forEach(node => {
    if (node.libraryNodeId) return;
    node.libraryNodeId = node._id;
  });
}

// Covert node references into actual nodes
// TODO: check permissions for each library a reference node references
export async function reifyNodeReferences(nodes, visitedRefs = new Set(), depth = 0) {
  depth += 1;
  const resultingNodes = [];
  const newNodes = [];

  for (const node of nodes) {
    // This isn't a reference node, continue as normal
    if (node.type !== 'reference') {
      resultingNodes.push(node);
      continue;
    }

    // We have gone too deep, keep the reference node as an error
    if (depth >= 10) {
      if (Meteor.isClient) console.warn('Reference depth limit exceeded');
      node.cache = { error: 'Reference depth limit exceeded' };
      resultingNodes.push(node);
      continue;
    }

    let referencedNode
    try {
      referencedNode = await fetchDocByRef(node.ref);
      referencedNode.tags = union(node.tags, referencedNode.tags);
      // We are definitely replacing this node, so add it to the list
      visitedRefs.add(node._id);
    } catch (e) {
      node.cache = { error: e.reason || e.message || e.toString() };
      resultingNodes.push(node);
      continue;
    }

    // Get all the descendants of the referenced node
    let descendants = await LibraryNodes.find({
      ...getFilter.descendants(referencedNode),
      removed: { $ne: true },
    }, {
      sort: { left: 1 },
    }).fetchAsync();

    // The referenced node takes the reference's place: its parent, and its position
    // among that parent's children. Otherwise it keeps the parent it has in its own
    // library, which is not among the copies, so the nested-set rebuild orphans it to
    // the top of the tree. Before the nested-set migration (e4590de3) setLineageOfDocs
    // and `order` did this. Set only now: the descendants query above reads the
    // referenced node's own left/right.
    referencedNode.parentId = node.parentId;
    referencedNode.left = node.left;

    // We are adding the referenced node and its descendants
    let addedNodes = [referencedNode, ...descendants];

    // Filter all the looped references
    addedNodes = addedNodes.filter(addedNode => {
      // Add all non-reference nodes
      if (addedNode.type !== 'reference') {
        return true;
      }
      // If this exact reference has already been resolved before, filter it out
      if (visitedRefs.has(addedNode._id)) {
        return false;
      } else {
        // Otherwise mark it as visited, and keep it
        visitedRefs.add(addedNode._id);
        return true;
      }
    });

    // Before renewing Ids make sure the library node reference is stored
    storeLibraryNodeReferences(addedNodes);

    // Give the new referenced sub-tree new ids
    // The referenced node must get the id of the ref node so that the
    // descendants of the ref node keep their ancestry intact
    renewDocIds({
      docArray: addedNodes,
      idMap: { [referencedNode._id]: node._id },
    });

    // Reify the subtree as well with recursion
    addedNodes = await reifyNodeReferences(addedNodes, visitedRefs, depth);

    // Store the new nodes from this inner loop without altering the array
    // we are looping over
    newNodes.push(...addedNodes);
  }

  // We are done filtering the array, we can add the new nodes to it
  resultingNodes.push(...newNodes);

  return resultingNodes;
}

export default insertPropertyFromLibraryNode;
