/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

import type {
  NodeKey,
  EditorConfig,
  EditorThemeClasses,
  OutlineNode,
  Selection,
} from 'outline';
import type {ParagraphNode} from 'outline/ParagraphNode';

import {isBlockNode, BlockNode} from 'outline';
import {createParagraphNode} from 'outline/ParagraphNode';
import {createListNode, isListNode} from 'outline/ListNode';
import invariant from 'shared/invariant';
import {getTopListNode, isLastItemInList} from 'outline/nodes';

export class ListItemNode extends BlockNode {
  static clone(node: ListItemNode): ListItemNode {
    return new ListItemNode(node.__key);
  }

  constructor(key?: NodeKey) {
    super(key);
    this.__type = 'listitem';
  }

  // View

  createDOM<EditorContext>(config: EditorConfig<EditorContext>): HTMLElement {
    const element = document.createElement('li');
    setListItemThemeClassNames(element, config.theme, this);
    return element;
  }

  updateDOM<EditorContext>(
    prevNode: ListItemNode,
    dom: HTMLElement,
    config: EditorConfig<EditorContext>,
  ): boolean {
    setListItemThemeClassNames(dom, config.theme, this);
    return false;
  }

  // Mutation

  replace<N: OutlineNode>(replaceWithNode: N): N {
    if (isListItemNode(replaceWithNode)) {
      return super.replace(replaceWithNode);
    }
    const list = this.getParentOrThrow();
    if (isListNode(list)) {
      const childrenKeys = list.__children;
      const childrenLength = childrenKeys.length;
      const index = childrenKeys.indexOf(this.__key);
      if (index === 0) {
        list.insertBefore(replaceWithNode);
      } else if (index === childrenLength - 1) {
        list.insertAfter(replaceWithNode);
      } else {
        // Split the list
        const newList = createListNode(list.__tag);
        const children = list.getChildren();
        for (let i = index + 1; i < childrenLength; i++) {
          const child = children[i];
          newList.append(child);
        }
        list.insertAfter(replaceWithNode);
        replaceWithNode.insertAfter(newList);
      }
      this.remove();
      if (childrenLength === 1) {
        list.remove();
      }
    }
    return replaceWithNode;
  }

  insertAfter(node: OutlineNode): OutlineNode {
    if (isListItemNode(node)) {
      return super.insertAfter(node);
    }

    const listNode = this.getParentOrThrow();
    if (!isListNode(listNode)) {
      invariant(
        false,
        'insertAfter: list node is not parent of list item node',
      );
    }

    // Attempt to merge tables if the list is of the same type.
    if (isListNode(node) && node.getTag() === listNode.getTag()) {
      let child = node;
      const children = node.getChildren();
      for (let i = children.length - 1; i >= 0; i--) {
        child = children[i];
        this.insertAfter(child);
      }
      return child;
    }

    // Otherwise, split the list
    // Split the lists and insert the node in between them
    const siblings = this.getNextSiblings();
    listNode.insertAfter(node);
    if (siblings.length !== 0) {
      const newListNode = createListNode(listNode.getTag());
      siblings.forEach((sibling) => newListNode.append(sibling));
      node.insertAfter(newListNode);
    }
    return node;
  }

  insertNewAfter(): ListItemNode | ParagraphNode {
    const nextSibling = this.getNextSibling();
    const prevSibling = this.getPreviousSibling();
    const list = getTopListNode(this);
    const isLast = isLastItemInList(this);

    let newBlock;

    if (
      isBlockNode(list) &&
      this.getTextContent() === '' &&
      (prevSibling === null || nextSibling === null) &&
      isLast
    ) {
      if (nextSibling === null) {
        newBlock = createParagraphNode();
        list.insertAfter(newBlock);
        this.remove();
      } else {
        newBlock = createParagraphNode();
        list.insertBefore(newBlock);
        this.remove();
      }
      if (list.isEmpty()) {
        list.remove();
      }
    } else {
      newBlock = createListItemNode();
      this.insertAfter(newBlock);
    }

    return newBlock;
  }

  collapseAtStart(selection: Selection): true {
    const paragraph = createParagraphNode();
    const children = this.getChildren();
    children.forEach((child) => paragraph.append(child));
    const listNode = this.getParentOrThrow();
    const listNodeParent = listNode.getParentOrThrow();
    const isNested = isListItemNode(listNodeParent);
    if (listNode.getChildrenSize() === 1) {
      if (isNested) {
        // if the list node is nested, we just want to remove it,
        // effectively unindenting it.
        listNode.remove();
        listNodeParent.select();
      } else {
        listNode.replace(paragraph);
        // If we have selection on the list item, we'll need to move it
        // to the paragraph
        const anchor = selection.anchor;
        const focus = selection.focus;
        const key = paragraph.getKey();
        if (anchor.type === 'block' && anchor.getNode().is(this)) {
          anchor.set(key, anchor.offset, 'block');
        }
        if (focus.type === 'block' && focus.getNode().is(this)) {
          focus.set(key, focus.offset, 'block');
        }
      }
    } else {
      listNode.insertBefore(paragraph);
      this.remove();
    }
    return true;
  }

  canInsertAfter(node: OutlineNode): boolean {
    return isListItemNode(node);
  }

  canReplaceWith(replacement: OutlineNode): boolean {
    return isListItemNode(replacement);
  }
}

function setListItemThemeClassNames(
  dom: HTMLElement,
  editorThemeClasses: EditorThemeClasses,
  node: ListItemNode,
): void {
  const classesToAdd = [];
  const classesToRemove = [];
  const listItemClassName = editorThemeClasses.listitem;
  let nestedListItemClassName;
  if (editorThemeClasses.nestedList) {
    nestedListItemClassName = editorThemeClasses.nestedList.listitem;
  }

  if (listItemClassName !== undefined) {
    const listItemClasses = listItemClassName.split(' ');
    classesToAdd.push(...listItemClasses);
  }

  if (nestedListItemClassName !== undefined) {
    const nestedListItemClasses = nestedListItemClassName.split(' ');
    if (node.getChildren().some((child) => isListNode(child))) {
      classesToAdd.push(...nestedListItemClasses);
    } else {
      classesToRemove.push(...nestedListItemClasses);
    }
  }

  if (classesToAdd.length > 0) {
    dom.classList.add(...classesToAdd);
  }
  if (classesToRemove.length > 0) {
    dom.classList.remove(...classesToRemove);
  }
}

export function createListItemNode(): ListItemNode {
  return new ListItemNode();
}

export function isListItemNode(node: ?OutlineNode): boolean %checks {
  return node instanceof ListItemNode;
}
