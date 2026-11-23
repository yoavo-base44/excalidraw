import {
  getBoundTextElementId,
  getLayerName,
  isBoundToContainer,
  isElementHidden,
  isFrameLikeElement,
  isTextElement,
} from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

export type LayerTreeNode = {
  /** stable id of the row (group rows are scoped by their parent row) */
  id: string;
  kind: "element" | "group";
  /** element id for element rows, group id for group rows */
  sourceId: string;
  element?: ExcalidrawElement;
  label: string;
  children: LayerTreeNode[];
  /** all element ids represented by this row (including descendants) */
  elementIds: ExcalidrawElement["id"][];
  hidden: boolean;
  locked: boolean;
  /** whether the row matches the current search query */
  matched: boolean;
  /** id of the parent row (null for top-level rows) */
  parentId: string | null;
  depth: number;
  /** z-index of the topmost element of the row (used for ordering) */
  sortKey: number;
};

export type BuildLayerTreeOptions = {
  labelForElement: (element: ExcalidrawElement) => string;
  groupLabel: string;
};

/** rows are listed topmost (highest z-index) first */
const sortTopMostFirst = (nodes: LayerTreeNode[]) => {
  return nodes.sort((a, b) => b.sortKey - a.sortKey);
};

const buildNodes = (
  elements: readonly ExcalidrawElement[],
  allElements: readonly ExcalidrawElement[],
  options: BuildLayerTreeOptions,
  zIndex: ReadonlyMap<ExcalidrawElement["id"], number>,
  parentId: string | null,
  parentGroupId: string | null,
  depth: number,
): LayerTreeNode[] => {
  const groupMembers = new Map<string, ExcalidrawElement[]>();
  const directMembers: ExcalidrawElement[] = [];

  for (const element of elements) {
    const childGroupId = parentGroupId
      ? element.groupIds[element.groupIds.indexOf(parentGroupId) - 1]
      : element.groupIds.at(-1);

    if (childGroupId) {
      const members = groupMembers.get(childGroupId);
      if (members) {
        members.push(element);
      } else {
        groupMembers.set(childGroupId, [element]);
      }
    } else {
      directMembers.push(element);
    }
  }

  const nodes: LayerTreeNode[] = directMembers.map((element) => {
    const rowId = `${parentId ?? "root"}:element:${element.id}`;
    const elementIds = [element.id];
    const boundTextId = getBoundTextElementId(element);
    if (boundTextId) {
      elementIds.push(boundTextId);
    }

    let children: LayerTreeNode[] = [];
    if (isFrameLikeElement(element)) {
      const frameChildren = allElements.filter(
        (candidate) =>
          candidate.frameId === element.id && !isBoundToContainer(candidate),
      );
      children = buildNodes(
        frameChildren,
        allElements,
        options,
        zIndex,
        rowId,
        null,
        depth + 1,
      );
      elementIds.push(...children.flatMap((child) => child.elementIds));
    }

    return {
      id: rowId,
      kind: "element" as const,
      sourceId: element.id,
      element,
      label: options.labelForElement(element),
      children,
      elementIds,
      hidden: isElementHidden(element),
      locked: element.locked,
      matched: false,
      parentId,
      depth,
      sortKey: zIndex.get(element.id) ?? 0,
    };
  });

  for (const [groupId, members] of groupMembers) {
    const rowId = `${parentId ?? "root"}:group:${groupId}`;
    const children = buildNodes(
      members,
      allElements,
      options,
      zIndex,
      rowId,
      groupId,
      depth + 1,
    );
    const elementIds = children.flatMap((child) => child.elementIds);

    nodes.push({
      id: rowId,
      kind: "group",
      sourceId: groupId,
      label: options.groupLabel,
      children,
      elementIds,
      hidden: children.every((child) => child.hidden),
      locked: children.every((child) => child.locked),
      matched: false,
      parentId,
      depth,
      sortKey: Math.max(...children.map((child) => child.sortKey), -1),
    });
  }

  return sortTopMostFirst(nodes);
};

/**
 * Builds the layer tree from scene elements, topmost row first.
 *
 * Elements bound to a container (text) are not rows of their own — they're
 * part of their container's row. Groups and frames become collapsible rows.
 */
export const buildLayerTree = (
  elements: readonly ExcalidrawElement[],
  options: BuildLayerTreeOptions,
): LayerTreeNode[] => {
  const zIndex = new Map<ExcalidrawElement["id"], number>();
  const sceneElements: ExcalidrawElement[] = [];

  elements.forEach((element, index) => {
    zIndex.set(element.id, index);
    if (element.isDeleted || isBoundToContainer(element)) {
      return;
    }
    sceneElements.push(element);
  });

  const rootElements = sceneElements.filter((element) => !element.frameId);

  return buildNodes(rootElements, sceneElements, options, zIndex, null, null, 0);
};

/**
 * Keeps only the rows matching the query (and the ancestors needed to reach
 * them). Matching is case-insensitive and applies to the row label.
 */
export const filterLayerTree = (
  nodes: readonly LayerTreeNode[],
  query: string,
): LayerTreeNode[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return nodes as LayerTreeNode[];
  }

  const walk = (node: LayerTreeNode): LayerTreeNode | null => {
    const children = node.children
      .map(walk)
      .filter((child): child is LayerTreeNode => !!child);
    const matched = node.label.toLowerCase().includes(normalizedQuery);

    if (!matched && !children.length) {
      return null;
    }

    return { ...node, children, matched };
  };

  return nodes.map(walk).filter((node): node is LayerTreeNode => !!node);
};

/**
 * Flattens the tree into the rows currently visible on screen, skipping the
 * children of collapsed rows.
 */
export const flattenLayerTree = (
  nodes: readonly LayerTreeNode[],
  collapsed: ReadonlySet<string>,
): LayerTreeNode[] => {
  const rows: LayerTreeNode[] = [];

  const walk = (list: readonly LayerTreeNode[]) => {
    for (const node of list) {
      rows.push(node);
      if (node.children.length && !collapsed.has(node.id)) {
        walk(node.children);
      }
    }
  };

  walk(nodes);

  return rows;
};

/**
 * Derives a human readable label for an element, falling back to the element
 * type when the element has no name or text.
 */
export const getLayerLabel = (
  element: ExcalidrawElement,
  elementsMap: ReadonlyMap<ExcalidrawElement["id"], ExcalidrawElement>,
  getTypeLabel: (element: ExcalidrawElement) => string,
): string => {
  const customName = getLayerName(element);
  if (customName) {
    return customName;
  }

  if (isFrameLikeElement(element) && element.name) {
    return element.name;
  }

  const text = isTextElement(element) ? element.text : null;
  const boundTextId = text ? null : getBoundTextElementId(element);
  const boundText = boundTextId ? elementsMap.get(boundTextId) : null;

  const labelText = text ?? (boundText && isTextElement(boundText) ? boundText.text : null);

  if (labelText) {
    const firstLine = labelText.trim().split("\n")[0];
    if (firstLine) {
      return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
    }
  }

  return getTypeLabel(element);
};
