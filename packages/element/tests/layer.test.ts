import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import {
  LAYER_CUSTOM_DATA_KEY,
  expandLayerElementIds,
  getLayerCustomData,
  getLayerName,
  getUpdatedLayerCustomData,
  isElementHidden,
} from "../src/layer";
import { syncInvalidIndices } from "../src/fractionalIndex";
import { Scene } from "../src/Scene";

import type { ExcalidrawElement } from "../src/types";

const withLayerData = (
  element: ExcalidrawElement,
  customData: Record<string, any>,
): ExcalidrawElement => ({ ...element, customData });

describe("layer metadata helpers", () => {
  it("defaults to a visible, unnamed element", () => {
    const element = API.createElement({ type: "rectangle" });

    expect(getLayerCustomData(element)).toBe(null);
    expect(isElementHidden(element)).toBe(false);
    expect(getLayerName(element)).toBe(null);
  });

  it("stores layer metadata in customData and prunes empty values", () => {
    const element = API.createElement({ type: "rectangle" });

    const hidden = getUpdatedLayerCustomData(element, { hidden: true });
    expect(hidden?.[LAYER_CUSTOM_DATA_KEY]).toEqual({ hidden: true });

    const named = getUpdatedLayerCustomData(
      withLayerData(element, hidden!),
      { name: "Background" },
    );
    expect(named?.[LAYER_CUSTOM_DATA_KEY]).toEqual({
      hidden: true,
      name: "Background",
    });

    const shown = getUpdatedLayerCustomData(
      withLayerData(element, named!),
      { hidden: false },
    );
    expect(shown?.[LAYER_CUSTOM_DATA_KEY]).toEqual({ name: "Background" });

    const cleared = getUpdatedLayerCustomData(
      withLayerData(element, shown!),
      { name: "   " },
    );
    expect(cleared).toBe(undefined);
  });

  it("keeps customData written by the host app", () => {
    const element = withLayerData(API.createElement({ type: "rectangle" }), {
      hostApp: { foo: "bar" },
    });

    const next = getUpdatedLayerCustomData(element, { hidden: true });

    expect(next).toEqual({
      hostApp: { foo: "bar" },
      [LAYER_CUSTOM_DATA_KEY]: { hidden: true },
    });
  });

  it("expands bound text elements together with their container", () => {
    const container = API.createElement({
      type: "rectangle",
      id: "container",
      boundElements: [{ type: "text", id: "boundText" }],
    });
    const boundText = API.createElement({
      type: "text",
      id: "boundText",
      text: "Hello",
      containerId: "container",
    });
    const other = API.createElement({ type: "rectangle", id: "other" });

    expect(
      [...expandLayerElementIds([container, boundText, other], ["container"])],
    ).toEqual(["container", "boundText"]);
  });
});

describe("hidden layers in the scene", () => {
  it("keeps hidden elements in the scene but out of the rendered elements", () => {
    const visible = API.createElement({ type: "rectangle", id: "visible" });
    const hidden = withLayerData(API.createElement({ type: "rectangle", id: "hidden" }), {
      [LAYER_CUSTOM_DATA_KEY]: { hidden: true },
    });

    const scene = new Scene(syncInvalidIndices([visible, hidden]));

    expect(scene.getNonDeletedElements().map((element) => element.id)).toEqual([
      "visible",
    ]);
    expect(
      scene.getElementsIncludingDeleted().map((element) => element.id),
    ).toEqual(["visible", "hidden"]);
  });

  it("brings hidden elements back when they're shown again", () => {
    const hidden = withLayerData(API.createElement({ type: "rectangle", id: "hidden" }), {
      [LAYER_CUSTOM_DATA_KEY]: { hidden: true },
    });

    const scene = new Scene(syncInvalidIndices([hidden]));
    expect(scene.getNonDeletedElements()).toHaveLength(0);

    scene.replaceAllElements(
      syncInvalidIndices([
        {
          ...hidden,
          customData: { [LAYER_CUSTOM_DATA_KEY]: { name: "Back" } },
        },
      ]),
    );

    expect(scene.getNonDeletedElements().map((element) => element.id)).toEqual([
      "hidden",
    ]);
  });
});

describe("layer persistence", () => {
  it("saves layer settings with the scene and restores them", () => {
    const element = withLayerData(
      API.createElement({ type: "rectangle", id: "rect" }),
      { [LAYER_CUSTOM_DATA_KEY]: { name: "Background", hidden: true } },
    );

    const serialized = serializeAsJSON([element], {}, {}, "local");
    const restored = restoreElements(
      JSON.parse(serialized).elements,
      null,
      { repairBindings: true },
    );

    expect(restored[0].customData).toEqual({
      [LAYER_CUSTOM_DATA_KEY]: { name: "Background", hidden: true },
    });
    expect(isElementHidden(restored[0])).toBe(true);
    expect(getLayerName(restored[0])).toBe("Background");
  });

  it("restores scenes saved without layer settings (older files)", () => {
    const element = API.createElement({ type: "rectangle", id: "legacy" });

    const restored = restoreElements([element], null, { repairBindings: true });

    expect(restored[0].customData).toBe(undefined);
    expect(isElementHidden(restored[0])).toBe(false);
    expect(getLayerName(restored[0])).toBe(null);
  });
});
