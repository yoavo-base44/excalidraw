import { newElementWith } from "./mutateElement";

import type { ExcalidrawElement } from "./types";

/**
 * Key under which the layers panel stores its per-element settings inside
 * `customData`. Using `customData` keeps the settings in sync with the normal
 * element persistence (local storage, `.excalidraw` files, collaboration)
 * without introducing new top-level element properties, so scenes saved by
 * older versions keep loading and scenes saved with layer settings still load
 * in older versions (they simply ignore the extra `customData` entry).
 */
export const LAYER_CUSTOM_DATA_KEY = "excalidrawLayers";

export type ElementLayerSettings = {
  /** custom name shown in the layers panel */
  name?: string;
  /** whether the element is hidden from the canvas */
  hidden?: boolean;
};

export const getElementLayerSettings = (
  element: Pick<ExcalidrawElement, "customData">,
): ElementLayerSettings => {
  const settings = element.customData?.[LAYER_CUSTOM_DATA_KEY];
  return settings && typeof settings === "object" ? settings : {};
};

export const isElementHidden = (
  element: Pick<ExcalidrawElement, "customData">,
): boolean => getElementLayerSettings(element).hidden === true;

export const setElementLayerSettings = <T extends ExcalidrawElement>(
  element: T,
  patch: ElementLayerSettings,
): T =>
  newElementWith(element, {
    customData: {
      ...element.customData,
      [LAYER_CUSTOM_DATA_KEY]: {
        ...getElementLayerSettings(element),
        ...patch,
      },
    },
  } as any) as T;
