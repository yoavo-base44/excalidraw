import { bumpVersion, newElementWith } from "./mutateElement";

import type { Mutable } from "@excalidraw/common/utility-types";

import type { ElementUpdate } from "./mutateElement";
import type { ExcalidrawElement } from "./types";

/**
 * Key under which the layers panel keeps its per-element metadata inside
 * `element.customData`.
 *
 * `customData` is part of the element schema and is preserved by every
 * Excalidraw version (including older ones which simply ignore it), so layer
 * settings are saved with the scene and stay backwards compatible: scenes
 * without this metadata fall back to derived defaults, and scenes with it can
 * still be opened by older clients without breaking.
 */
export const LAYER_CUSTOM_DATA_KEY = "excalidrawLayer";

export type LayerCustomData = {
  /** user-provided layer name */
  name?: string;
  /** whether the element is hidden on the canvas (it stays part of the scene) */
  hidden?: boolean;
};

export const getLayerCustomData = (
  element: ExcalidrawElement,
): LayerCustomData | null => {
  const data = element.customData?.[LAYER_CUSTOM_DATA_KEY];
  if (!data || typeof data !== "object") {
    return null;
  }
  return data as LayerCustomData;
};

export const isElementHidden = (element: ExcalidrawElement): boolean => {
  return getLayerCustomData(element)?.hidden === true;
};

export const getLayerName = (element: ExcalidrawElement): string | null => {
  const name = getLayerCustomData(element)?.name;
  return typeof name === "string" && name.trim().length ? name.trim() : null;
};

/**
 * Returns the next `customData` for the element with the layer updates applied.
 *
 * Empty layer metadata is pruned so that elements which were never renamed or
 * hidden don't get needless `customData` written to the scene.
 */
export const getUpdatedLayerCustomData = (
  element: ExcalidrawElement,
  updates: Partial<LayerCustomData>,
): Record<string, any> | undefined => {
  const nextCustomData = { ...(element.customData || {}) };
  const nextLayerData: LayerCustomData = {
    ...(getLayerCustomData(element) || {}),
    ...updates,
  };

  if (!nextLayerData.name?.trim()) {
    delete nextLayerData.name;
  }
  if (!nextLayerData.hidden) {
    delete nextLayerData.hidden;
  }

  if (Object.keys(nextLayerData).length) {
    nextCustomData[LAYER_CUSTOM_DATA_KEY] = nextLayerData;
  } else {
    delete nextCustomData[LAYER_CUSTOM_DATA_KEY];
  }

  return Object.keys(nextCustomData).length ? nextCustomData : undefined;
};

/**
 * Returns the element with the layer updates applied, removing `customData`
 * entirely when no layer metadata is left.
 */
export const getElementWithLayerUpdate = <T extends ExcalidrawElement>(
  element: T,
  updates: Partial<LayerCustomData>,
): T => {
  const customData = getUpdatedLayerCustomData(element, updates);

  if (customData) {
    return newElementWith(element, { customData } as ElementUpdate<T>);
  }

  if (!element.customData) {
    return element;
  }

  const nextElement = { ...element } as Mutable<ExcalidrawElement>;
  delete nextElement.customData;

  return bumpVersion(nextElement) as T;
};

/**
 * Expands the given element ids to the elements that must always be toggled
 * together with them (currently the text bound to a container).
 *
 * Note we deliberately do not expand groups or frames here — the layers panel
 * already passes the whole set of ids represented by a layer row.
 */
export const expandLayerElementIds = (
  elements: readonly ExcalidrawElement[],
  elementIds: readonly ExcalidrawElement["id"][],
): Set<ExcalidrawElement["id"]> => {
  const ids = new Set<ExcalidrawElement["id"]>(elementIds);
  const byId = new Map(elements.map((element) => [element.id, element]));

  for (const id of elementIds) {
    const element = byId.get(id);
    if (!element) {
      continue;
    }
    for (const other of elements) {
      if (
        "containerId" in other &&
        other.containerId === element.id &&
        !ids.has(other.id)
      ) {
        ids.add(other.id);
      }
    }
  }

  return ids;
};
