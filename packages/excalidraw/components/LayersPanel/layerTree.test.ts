import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  buildLayerTree,
  filterLayerTree,
  flattenLayerTree,
  getLayerLabel,
} from "./layerTree";

const build = (elements: readonly ExcalidrawElement[]) => {
  const elementsMap = new Map(elements.map((element) => [element.id, element]));
  return buildLayerTree(elements, {
    labelForElement: (element) =>
      getLayerLabel(element, elementsMap, (el) => el.type),
    groupLabel: "Group",
  });
};

describe("buildLayerTree", () => {
  // rows are ordered topmost first, matching the canvas z-order
  it("lists elements topmost first", () => {
    const elements = [
      API.createElement({ type: "rectangle", id: "bottom" }),
      API.createElement({ type: "rectangle", id: "middle" }),
      API.createElement({ type: "rectangle", id: "top" }),
    ];

    expect(build(elements).map((node) => node.sourceId)).toEqual([
      "top",
      "middle",
      "bottom",
    ]);
  });

  it("groups elements and positions the group by its topmost member", () => {
    const elements = [
      API.createElement({ type: "rectangle", id: "groupBottom", groupIds: ["g1"] }),
      API.createElement({ type: "rectangle", id: "loose" }),
      API.createElement({ type: "rectangle", id: "groupTop", groupIds: ["g1"] }),
    ];

    const tree = build(elements);

    expect(tree.map((node) => node.kind)).toEqual(["group", "element"]);
    expect(tree[0].sourceId).toBe("g1");
    expect(tree[0].elementIds).toEqual(["groupTop", "groupBottom"]);
    expect(tree[0].children.map((node) => node.sourceId)).toEqual([
      "groupTop",
      "groupBottom",
    ]);
    expect(tree[1].sourceId).toBe("loose");
  });

  it("nests frame children under the frame", () => {
    const elements = [
      {
        ...API.createElement({ type: "frame", id: "frame" }),
        name: "Flow",
      },
      API.createElement({ type: "rectangle", id: "child", frameId: "frame" }),
      API.createElement({ type: "rectangle", id: "outside" }),
    ];

    const tree = build(elements);

    expect(tree.map((node) => node.sourceId)).toEqual(["outside", "frame"]);
    expect(tree[1].label).toBe("Flow");
    expect(tree[1].children.map((node) => node.sourceId)).toEqual(["child"]);
    expect(tree[1].elementIds).toEqual(["frame", "child"]);
  });

  it("labels elements by their text content", () => {
    const elements = [
      API.createElement({ type: "text", id: "text", text: "First line\nSecond" }),
    ];

    expect(build(elements)[0].label).toBe("First line");
  });

  it("prefers the user-provided layer name", () => {
    const element = {
      ...API.createElement({ type: "rectangle", id: "named" }),
      customData: { excalidrawLayer: { name: "Background" } },
    };

    expect(build([element])[0].label).toBe("Background");
  });

  it("aggregates visibility and locking for group rows", () => {
    const hidden = {
      ...API.createElement({ type: "rectangle", id: "a", groupIds: ["g1"] }),
      customData: { excalidrawLayer: { hidden: true } },
    };
    const locked = API.createElement({
      type: "rectangle",
      id: "b",
      groupIds: ["g1"],
      locked: true,
    });

    const [group] = build([hidden, locked]);

    expect(group.hidden).toBe(false);
    expect(group.locked).toBe(false);
  });

  it("marks a group hidden only when all its members are hidden", () => {
    const hiddenA = {
      ...API.createElement({ type: "rectangle", id: "a", groupIds: ["g1"] }),
      customData: { excalidrawLayer: { hidden: true } },
    };
    const hiddenB = {
      ...API.createElement({ type: "rectangle", id: "b", groupIds: ["g1"] }),
      customData: { excalidrawLayer: { hidden: true } },
    };

    expect(build([hiddenA, hiddenB])[0].hidden).toBe(true);
  });
});

describe("filterLayerTree", () => {
  const elements = [
    API.createElement({ type: "rectangle", id: "rect" }),
    API.createElement({ type: "text", id: "text", text: "Invoice total" }),
  ];

  it("returns everything for an empty query", () => {
    expect(filterLayerTree(build(elements), "  ")).toHaveLength(2);
  });

  it("keeps matching rows only", () => {
    const filtered = filterLayerTree(build(elements), "invoice");

    expect(filtered).toHaveLength(1);
    expect(filtered[0].sourceId).toBe("text");
    expect(filtered[0].matched).toBe(true);
  });

  it("keeps the ancestors of matching children", () => {
    const withGroup = [
      API.createElement({ type: "text", id: "t", text: "Invoice", groupIds: ["g1"] }),
      API.createElement({ type: "rectangle", id: "r", groupIds: ["g1"] }),
    ];

    const filtered = filterLayerTree(build(withGroup), "invoice");

    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("group");
    expect(filtered[0].children.map((node) => node.sourceId)).toEqual(["t"]);
  });
});

describe("flattenLayerTree", () => {
  it("skips children of collapsed rows", () => {
    const elements = [
      API.createElement({ type: "rectangle", id: "a", groupIds: ["g1"] }),
      API.createElement({ type: "rectangle", id: "b", groupIds: ["g1"] }),
      API.createElement({ type: "rectangle", id: "loose" }),
    ];

    const tree = build(elements);

    expect(flattenLayerTree(tree, new Set()).map((node) => node.sourceId)).toEqual([
      "loose",
      "g1",
      "b",
      "a",
    ]);
    expect(
      flattenLayerTree(tree, new Set([tree[1].id])).map((node) => node.sourceId),
    ).toEqual(["loose", "g1"]);
  });
});
