import ParseNode from '/imports/parser/parseTree/ParseNode';
import ResolveLevelFunction from '/imports/parser/types/ResolveLevelFunction';

export type ConstantValueType = number | string | boolean

// Read a constant's type with `typeof node.value`. Nodes used to carry it in a
// `valueType` field too: the ones stored before still do, and nothing reads it.
export type ConstantNode = {
  parseType: 'constant';
  value: ConstantValueType;
  isUndefined?: true;
}

export type FiniteNumberConstantNode = {
  parseType: 'constant';
  value: number;
}

type ConstantFactory = {
  create({ value, isUndefined }: { value: ConstantValueType, isUndefined?: true }): ConstantNode;
  compile: ResolveLevelFunction<ConstantNode>;
  toString(node: ConstantNode): string;
}

const constant: ConstantFactory = {
  create({ value, isUndefined }): ConstantNode {
    return {
      parseType: 'constant',
      value,
      ...isUndefined && { isUndefined: true }
    }
  },
  async compile(node, scope, context) {
    return { result: node, context };
  },
  toString(node) {
    return `${node.value}`;
  },
}

export function isFiniteNode(node: ParseNode | undefined): node is FiniteNumberConstantNode {
  return node
    && node.parseType === 'constant'
    && typeof node.value === 'number'
    && isFinite(node.value)
    || false;
}

export default constant;
