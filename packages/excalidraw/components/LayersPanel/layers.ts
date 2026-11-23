import {
  isBoundToContainer,
  isElementHidden,
  isFrameLikeElement,
  isTextElement,
  setElementLayerSettings,
  getElementLayerSettings,
} from "@excalidraw/element";
import { newElementWith } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import type { TranslationKeys } from "../../i18n";

export type TranslateFn = (
  key: TranslationKeys,
  vars?: Record<string, string | number>,
) => string;

type LayerRowBase = {
  /** stable row id: element id or group id */
  id: string;
  /** nesting level, 0 = top level */
  depth: number;
  /** id of the directly containing group, `null` for top-level rows */
  parentGroupId: string | null;
  /** all element ids the row represents (groups include nested members) */
  elementIds: string[];
  /** elements hidden/locked together with the row (bound text, frame children) */
  hiddenElementIds: string[];
  name: string;
  hidden: boolean;
  locked: boolean;
  children: LayerRow[];
};

export type LayerGroupRow = LayerRowBase & {
  kind: "group";
  groupId: string;
};

export type LayerElementRow = LayerRowBase & {
  kind: "element";
  element: NonDeletedExcalidrawElement;
};

export type LayerRow = LayerGroupRow | LayerElementRow;

const ELEMENT_TYPE_LABEL_KEYS: Record<string, TranslationKeys> = {
  rectangle: "element.rectangle",
  diamond: "element.diamond",
  ellipse: "element.ellipse",
  arrow: "element.arrow",
  line: "element.line",
  freedraw: "element.freedraw",
  text: "element.text",
  image: "element.image",
  frame: "element.frame",
  magicframe: "element.magicframe",
  embeddable: "element.embeddable",
  iframe: "element.iframe",
};

/** Elements that are represented by their container in the layers panel. */
const isRepresentedByContainer = (element: NonDeletedExcalidrawElement) =>
  isTextElement(element) && isBoundToContainer(element);

/**
 * Human readable name of a layer row. Falls back to the element type, or the
 * text content for text elements, so every row is searchable.
 */
export const getLayerElementName = (
  element: NonDeletedExcalidrawElement,
  translate: TranslateFn,
): string => {
  const customName = getElementLayerSettings(element).name?.trim();
  if (customName) {
    return customName;
  }
  if (isTextElement(element)) {
    const text = element.text.trim().split("\n")[0].trim();
    return text.slice(0, 80) || translate("element.text");
  }
  if (isFrameLikeElement(element) && element.name?.trim()) {
    return element.name.trim();
  }
  const typeKey = ELEMENT_TYPE_LABEL_KEYS[element.type];
  return typeKey ? translate(typeKey) : element.type;
};

/**
 * Builds the layer tree from the scene elements.
 *
 * Rows are ordered top-most first (highest z-index at the top), like the
 * canvas stacking. Group members are kept together under a group row, and
 * bound text elements are represented by their container.
 */
export const buildLayerRows = (
  elements: readonly NonDeletedExcalidrawElement[],
  translate: TranslateFn,
): LayerRow[] => {
  const root: LayerRow[] = [];
  const groups = new Map<string, LayerGroupRow>();
  const elementsById = new Map(
    elements.map((element) => [element.id, element]),
  );

  const boundTextByContainerId = new Map<string, string[]>();
  const frameChildIds = new Map<string, string[]>();
  for (const element of elements) {
    if (isTextElement(element) && element.containerId) {
      const boundTextIds =
        boundTextByContainerId.get(element.containerId) ?? [];
      boundTextByContainerId.set(element.containerId, [
        ...boundTextIds,
        element.id,
      ]);
    }
    if (element.frameId) {
      const childIds = frameChildIds.get(element.frameId) ?? [];
      frameChildIds.set(element.frameId, [...childIds, element.id]);
    }
  }

  for (const element of elements) {
    if (isRepresentedByContainer(element)) {
      continue;
    }

    let siblings = root;
    let parentGroupId: string | null = null;
    // `groupIds` are ordered deepest -> shallowest
    for (const groupId of [...element.groupIds].reverse()) {
      let group = groups.get(groupId);
      if (!group) {
        group = {
          kind: "group",
          id: groupId,
          groupId,
          depth: 0,
          parentGroupId,
          elementIds: [],
          hiddenElementIds: [],
          name: translate("element.group"),
          hidden: false,
          locked: false,
          children: [],
        };
        groups.set(groupId, group);
        siblings.push(group);
      }
      parentGroupId = groupId;
      siblings = group.children;
    }

    // elements hidden together with this row (bound text, frame children)
    const hiddenElementIds = [
      element.id,
      ...(boundTextByContainerId.get(element.id) ?? []),
      ...(frameChildIds.get(element.id) ?? []),
    ];

    siblings.push({
      kind: "element",
      id: element.id,
      element,
      depth: 0,
      parentGroupId,
      elementIds: [element.id],
      hiddenElementIds,
      name: getLayerElementName(element, translate),
      hidden: hiddenElementIds.every((elementId) => {
        const relatedElement = elementsById.get(elementId);
        return relatedElement ? isElementHidden(relatedElement) : true;
      }),
      locked: element.locked,
      children: [],
    });
  }

  const finalize = (rows: LayerRow[], depth: number) => {
    for (const row of rows) {
      row.depth = depth;
      finalize(row.children, depth + 1);
      if (row.kind === "group") {
        row.elementIds = row.children.flatMap((child) => child.elementIds);
        row.hiddenElementIds = row.children.flatMap(
          (child) => child.hiddenElementIds,
        );
        row.hidden =
          row.children.length > 0 &&
          row.children.every((child) => child.hidden);
        row.locked =
          row.children.length > 0 &&
          row.children.every((child) => child.locked);
      }
    }
    // display highest z-index first
    rows.reverse();
  };
  finalize(root, 0);

  return root;
};

const rowMatchesQuery = (row: LayerRow, query: string): boolean => {
  if (!query) {
    return true;
  }
  if (row.name.toLowerCase().includes(query)) {
    return true;
  }
  return row.children.some((child) => rowMatchesQuery(child, query));
};

/**
 * Flattens the tree into the list of rows currently visible in the panel,
 * honoring collapsed groups and the search query (search always expands).
 */
export const flattenLayerRows = (
  rows: readonly LayerRow[],
  {
    collapsedGroupIds,
    query,
  }: {
    collapsedGroupIds?: ReadonlySet<string>;
    query?: string;
  } = {},
): LayerRow[] => {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const result: LayerRow[] = [];

  const walk = (currentRows: readonly LayerRow[]) => {
    for (const row of currentRows) {
      if (!rowMatchesQuery(row, normalizedQuery)) {
        continue;
      }
      result.push(row);
      if (row.kind === "group") {
        const collapsed =
          !normalizedQuery && collapsedGroupIds?.has(row.groupId);
        if (!collapsed) {
          walk(row.children);
        }
      }
    }
  };

  walk(rows);
  return result;
};

export const findLayerRowLocation = (
  rows: readonly LayerRow[],
  rowId: string,
): {
  row: LayerRow;
  siblings: readonly LayerRow[];
  index: number;
} | null => {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.id === rowId) {
      return { row, siblings: rows, index };
    }
    const nested = findLayerRowLocation(row.children, rowId);
    if (nested) {
      return nested;
    }
  }
  return null;
};

export const getLayerRowSelection = (row: LayerRow) => {
  const selectedElementIds = row.elementIds.reduce(
    (acc: Record<string, true>, elementId) => {
      acc[elementId] = true;
      return acc;
    },
    {},
  );
  return {
    selectedElementIds,
    selectedGroupIds:
      row.kind === "group"
        ? { [row.groupId]: true }
        : ({} as Record<string, boolean>),
  };
};

const mapElements = (
  elements: readonly NonDeletedExcalidrawElement[],
  iteratee: (
    element: NonDeletedExcalidrawElement,
  ) => NonDeletedExcalidrawElement,
): NonDeletedExcalidrawElement[] => {
  let didChange = false;
  const nextElements = elements.map((element) => {
    const nextElement = iteratee(element);
    if (nextElement !== element) {
      didChange = true;
    }
    return nextElement;
  });
  return didChange
    ? nextElements
    : (elements as unknown as NonDeletedExcalidrawElement[]);
};

export const setLayerElementsHidden = (
  elements: readonly NonDeletedExcalidrawElement[],
  elementIds: readonly string[],
  hidden: boolean,
): NonDeletedExcalidrawElement[] => {
  const ids = new Set(elementIds);
  return mapElements(elements, (element) =>
    ids.has(element.id) && isElementHidden(element) !== hidden
      ? setElementLayerSettings(element, { hidden })
      : element,
  );
};

export const setLayerElementsLocked = (
  elements: readonly NonDeletedExcalidrawElement[],
  elementIds: readonly string[],
  locked: boolean,
): NonDeletedExcalidrawElement[] => {
  const ids = new Set(elementIds);
  return mapElements(elements, (element) =>
    ids.has(element.id) && element.locked !== locked
      ? newElementWith(element, { locked })
      : element,
  );
};

export const renameLayerElement = (
  elements: readonly NonDeletedExcalidrawElement[],
  elementId: string,
  name: string,
): NonDeletedExcalidrawElement[] => {
  const nextName = name.trim() || undefined;
  return mapElements(elements, (element) =>
    element.id === elementId &&
    getElementLayerSettings(element).name !== nextName
      ? setElementLayerSettings(element, { name: nextName })
      : element,
  );
};

/**
 * Moves a layer row (element or group) next to a sibling row.
 *
 * `placement` is relative to the target row in z-order: `above` inserts the
 * moved elements after the target in the scene array (higher z-index),
 * `below` inserts them before the target.
 *
 * Returns `null` when the rows aren't siblings or the move would nest a row
 * inside itself.
 */
export const reorderLayerRow = (
  elements: readonly NonDeletedExcalidrawElement[],
  row: LayerRow,
  target: LayerRow,
  placement: "above" | "below",
): NonDeletedExcalidrawElement[] | null => {
  if (row.id === target.id || row.parentGroupId !== target.parentGroupId) {
    return null;
  }
  const targetIds = new Set(target.elementIds);
  if (row.elementIds.some((elementId) => targetIds.has(elementId))) {
    return null;
  }

  const movedIds = new Set(row.elementIds);
  const movedElements = elements.filter((element) => movedIds.has(element.id));
  const remaining = elements.filter((element) => !movedIds.has(element.id));

  const targetIndices = remaining
    .map((element, index) => (targetIds.has(element.id) ? index : -1))
    .filter((index) => index >= 0);
  if (!targetIndices.length || !movedElements.length) {
    return null;
  }

  const insertAt =
    placement === "above"
      ? Math.max(...targetIndices) + 1
      : Math.min(...targetIndices);

  return [
    ...remaining.slice(0, insertAt),
    ...movedElements,
    ...remaining.slice(insertAt),
  ];
};
