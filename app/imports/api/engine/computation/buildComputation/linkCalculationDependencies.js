import traverse from '/imports/parser/traverse';

export default function linkCalculationDependencies(dependencyGraph, prop, { propsById }) {
  prop._computationDetails.calculations.forEach(calcObj => {
    // Store resolved ancestors
    const memo = {
      // ancestors: {} //this gets added if there are resolved ancestors
    };
    // Add this calculation to the dependency graph
    const calcNodeId = `${prop._id}.${calcObj._key}`;

    // Skip empty calculations that aren't targeted by anything
    if (
      !calcObj.calculation
      && !calcObj.effectIds
      && !calcObj.proficiencyIds
    ) return;

    dependencyGraph.addNode(calcNodeId, calcObj);
    // Traverse the parsed calculation looking for variable names
    traverse(calcObj.parseNode, node => {
      // Skip nodes that aren't symbols or accessors
      if (node.parseType !== 'symbol' && node.parseType !== 'accessor') return;
      // Link ancestor references as direct property dependencies
      if (node.name[0] === '#') {
        let ancestorProp = getAncestorProp(
          node.name.slice(1), memo, prop, propsById
        );
        if (!ancestorProp) return;
        // Depend on the ancestor's calculation when one is referenced
        // (`#spellList.dc`), otherwise on the whole ancestor, whose other
        // fields are computed with it. Depending on the whole ancestor for a
        // calculation made a loop whenever the ancestor depends on this prop.
        const field = node.path?.[0];
        const referencesCalculation = field !== undefined && ancestorProp
          ._computationDetails?.calculations?.some(calc => calc._key === field);
        dependencyGraph.addLink(
          calcNodeId,
          referencesCalculation ? `${ancestorProp._id}.${field}` : ancestorProp._id,
          'ancestorReference'
        );
      } else {
        // Link variable name references as variable dependencies
        dependencyGraph.addLink(
          calcNodeId, node.name, 'variableReference'
        );
      }
    });
    // Store the resolved ancestors in this calculation's local scope
    if (memo.ancestors) {
      calcObj._localScope = { ...calcObj._localScope, ...memo.ancestors };
    }
  });
}

function getAncestorProp(type, memo, prop, propsById) {
  if (memo.ancestors && memo.ancestors['#' + type]) {
    return memo.ancestors['#' + type];
  } else {
    var ancestorProp = findAncestorByType(prop, type, propsById);
    if (!memo.ancestors) memo.ancestors = {};
    memo.ancestors['#' + type] = ancestorProp;
    return ancestorProp;
  }
}

function findAncestorByType(prop, type, propsById) {
  if (!prop || !prop.parentId) return;
  let parentProp = prop;
  while (parentProp) {
    parentProp = propsById[parentProp.parentId];
    if (parentProp?.type === type) {
      return parentProp;
    }
  }
}
