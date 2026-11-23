import { arrayToMap } from "@excalidraw/common";

import {
  CaptureUpdateAction,
  expandLayerElementIds,
  getElementWithLayerUpdate,
  isElementHidden,
  newElementWith,
  syncMovedIndices,
} from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { register } from "./register";

export type LayerActionElementIds = {
  elementIds: readonly ExcalidrawElement["id"][];
};

export type RenameLayerActionData = {
  elementId: ExcalidrawElement["id"];
  name: string;
};

export type MoveLayerActionData = {
  /** ids of the layer row being moved (including its descendants) */
  elementIds: readonly ExcalidrawElement["id"][];
  /** ids of the sibling row the moved row is dropped on */
  targetElementIds: readonly ExcalidrawElement["id"][];
  position: "before" | "after";
};

/** resolves the element ids a layer row action applies to */
const getTargets = (
  elements: readonly ExcalidrawElement[],
  elementIds: readonly ExcalidrawElement["id"][] | undefined,
) => {
  const ids = expandLayerElementIds(elements, elementIds || []);
  return {
    ids,
    elements: elements.filter(
      (element) => ids.has(element.id) && !element.isDeleted,
    ),
  };
};

export const actionToggleLayerVisibility = register<LayerActionElementIds>({
  name: "toggleLayerVisibility",
  label: "labels.layersPanel.toggleVisibility",
  trackEvent: { category: "element" },
  perform: (elements, appState, value: LayerActionElementIds | undefined) => {
    const targets = getTargets(elements, value?.elementIds);
    if (!targets.elements.length) {
      return false;
    }

    // if any of the targeted layers is visible, hide the whole selection
    const shouldHide = targets.elements.some(
      (element) => !isElementHidden(element),
    );

    const nextElements = elements.map((element) => {
      if (!targets.ids.has(element.id)) {
        return element;
      }
      return getElementWithLayerUpdate(element, { hidden: shouldHide });
    });

    const nextSelectedElementIds = shouldHide
      ? Object.fromEntries(
          Object.entries(appState.selectedElementIds).filter(
            ([id]) => !targets.ids.has(id),
          ),
        )
      : appState.selectedElementIds;

    return {
      elements: nextElements,
      appState: {
        ...appState,
        selectedElementIds: nextSelectedElementIds,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

export const actionToggleLayerLock = register<LayerActionElementIds>({
  name: "toggleLayerLock",
  label: "labels.layersPanel.toggleLock",
  trackEvent: { category: "element" },
  perform: (elements, appState, value: LayerActionElementIds | undefined) => {
    const targets = getTargets(elements, value?.elementIds);
    if (!targets.elements.length) {
      return false;
    }

    const shouldLock = targets.elements.some((element) => !element.locked);

    const nextElements = elements.map((element) => {
      if (!targets.ids.has(element.id)) {
        return element;
      }
      return newElementWith(element, { locked: shouldLock });
    });

    // locked elements can't be selected, so drop them from the selection
    const nextSelectedElementIds = shouldLock
      ? Object.fromEntries(
          Object.entries(appState.selectedElementIds).filter(
            ([id]) => !targets.ids.has(id),
          ),
        )
      : appState.selectedElementIds;

    return {
      elements: nextElements,
      appState: {
        ...appState,
        selectedElementIds: nextSelectedElementIds,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

export const actionRenameLayer = register<RenameLayerActionData>({
  name: "renameLayer",
  label: "labels.layersPanel.rename",
  trackEvent: { category: "element" },
  perform: (elements, appState, value: RenameLayerActionData | undefined) => {
    if (!value?.elementId) {
      return false;
    }

    const name = value.name.trim();

    const nextElements = elements.map((element) => {
      if (element.id !== value.elementId) {
        return element;
      }
      return getElementWithLayerUpdate(element, { name });
    });

    return {
      elements: nextElements,
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

export const actionMoveLayer = register<MoveLayerActionData>({
  name: "moveLayer",
  label: "labels.layersPanel.reorder",
  trackEvent: { category: "element" },
  perform: (elements, appState, value: MoveLayerActionData | undefined) => {
    if (!value?.elementIds?.length || !value.targetElementIds?.length) {
      return false;
    }

    const movingIds = expandLayerElementIds(elements, value.elementIds);
    const targetIds = expandLayerElementIds(elements, value.targetElementIds);

    // moving a row onto itself is a no-op
    for (const id of targetIds) {
      if (movingIds.has(id)) {
        return false;
      }
    }

    const moving = elements.filter((element) => movingIds.has(element.id));
    if (!moving.length) {
      return false;
    }

    const targetIndices = elements.reduce<number[]>((acc, element, index) => {
      if (targetIds.has(element.id)) {
        acc.push(index);
      }
      return acc;
    }, []);

    if (!targetIndices.length) {
      return false;
    }

    // the target may be a whole layer row (e.g. a frame with its children),
    // so insert relative to its outermost element
    const boundaryElementId =
      value.position === "after"
        ? elements[targetIndices[targetIndices.length - 1]].id
        : elements[targetIndices[0]].id;

    const rest = elements.filter((element) => !movingIds.has(element.id));
    const boundaryIndex = rest.findIndex(
      (element) => element.id === boundaryElementId,
    );

    if (boundaryIndex === -1) {
      return false;
    }

    const insertAt =
      value.position === "after" ? boundaryIndex + 1 : boundaryIndex;

    const nextElements = [
      ...rest.slice(0, insertAt),
      ...moving,
      ...rest.slice(insertAt),
    ];

    // keep the fractional indices in sync with the new array order
    syncMovedIndices(nextElements, arrayToMap(moving));

    return {
      elements: nextElements,
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
