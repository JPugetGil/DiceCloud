import { buildComputationFromProps } from '/imports/api/engine/computation/buildCreatureComputation';

/**
 * The computation of these properties alone, as the engine's unit tests build
 * it: no creature document, no stored variables. The engine computes
 * properties without them; only a creature being loaded has them
 */
export default function computationFromProps(properties: any[]) {
  return buildComputationFromProps(properties, undefined as any, {});
}
