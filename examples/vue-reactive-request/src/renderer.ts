import { createRenderer } from 'vue'

// Implement only the host operations Vue needs to run component lifecycle hooks without a browser DOM.

export interface HostNode {
  parent: HostElement | null
  text: string
}

export interface HostElement extends HostNode {
  children: HostNode[]
}

function detach(node: HostNode): void {
  const siblings = node.parent?.children
  const index = siblings?.indexOf(node) ?? -1
  if (siblings && index >= 0) siblings.splice(index, 1)
  node.parent = null
}

export const hostRenderer = createRenderer<HostNode, HostElement>({
  patchProp() {},
  insert(child, parent, anchor) {
    detach(child)
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index >= 0) parent.children.splice(index, 0, child)
    else parent.children.push(child)
    child.parent = parent
  },
  remove: detach,
  createElement() {
    return { children: [], parent: null, text: '' }
  },
  createText(text) {
    return { parent: null, text }
  },
  createComment(text) {
    return { parent: null, text }
  },
  setText(node, text) {
    node.text = text
  },
  setElementText(element, text) {
    element.children = []
    element.text = text
  },
  parentNode(node) {
    return node.parent
  },
  nextSibling(node) {
    const siblings = node.parent?.children
    return siblings?.[(siblings.indexOf(node) ?? -1) + 1] ?? null
  },
})

export function createHostRoot(): HostElement {
  return { children: [], parent: null, text: '' }
}
