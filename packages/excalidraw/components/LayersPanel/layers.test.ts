import {
  getElementLayerSettings,
  isElementHidden,
  setElementLayerSettings,
} from "@excalidraw/element";

import { restoreElements } from "../../data/restore";
import { serializeAsJSON } from "../../data/json";
import { API } from "../../tests/helpers/api";

import {
  buildLayerRows,
  flattenLayerRows,
  getLayerRowSelection,
  renameLayerElement,
  reorderLayerRow,
  setLayerElementsHidden,
  setLayerElementsLocked,
} from "./layers";

const translate = ((key: string) => key) as any;

const createElements = () => [
  API.createElement({ id: "A", y: 0 }),
  API.createElement({ id: "B", y: 100 }),
  API.createElement({ id: "C", y: 200 }),
  API.createElement({ id: "D", y: 300 }),
];

describe("layers panel helpers", () => {
  describe("buildLayerRows", () => {
    it("orders rows top-most first", () => {
      const rows = buildLayerRows(createElements(), translate);
      expect(rows.map((row) => row.id)).toEqual(["D", "C", "B", "A"]);
    });

    it("nests group members under a group row", () => {
      const elements = [
        API.createElement({ id: "A", y: 0 }),
        API.createElement({ id: "B", y: 100, groupIds: ["g1"] }),
        API.createElement({ id: "C", y: 200, groupIds: ["g1"] }),
        API.createElement({ id: "D", y: 300 }),
      ];

      const rows = buildLayerRows(elements, translate);
      expect(rows.map((row) => row.id)).toEqual(["D", "g1", "A"]);

      const group = rows.find((row) => row.kind === "group")!;
      expect(group.elementIds.sort()).toEqual(["B", "C"]);
      expect(group.children.map((row) => row.id)).toEqual(["C", "B"]);
      expect(group.children[0].depth).toBe(1);
    });

    it("uses text content and custom names for element names", () => {
      const text = API.createElement({
        type: "text",
        id: "T",
        text: "Hello world",
      });
      const renamed = setElementLayerSettings(API.createElement({ id: "A" }), {
        name: "My box",
      });

      const rows = buildLayerRows([text, renamed], translate);
      const names = rows.map((row) => row.name);
      expect(names).toContain("Hello world");
      expect(names).toContain("My box");
    });

    it("reports group visibility and locking from its members", () => {
      const elements = [
        setElementLayerSettings(
          API.createElement({ id: "B", y: 100, groupIds: ["g1"] }),
          { hidden: true },
        ),
        setElementLayerSettings(
          API.createElement({ id: "C", y: 200, groupIds: ["g1"] }),
          { hidden: true },
        ),
      ];

      const [group] = buildLayerRows(elements, translate);
      expect(group.kind).toBe("group");
      expect(group.hidden).toBe(true);
      expect(group.locked).toBe(false);
    });
  });

  describe("flattenLayerRows", () => {
    it("hides children of collapsed groups", () => {
      const elements = [
        API.createElement({ id: "A", y: 0 }),
        API.createElement({ id: "B", y: 100, groupIds: ["g1"] }),
        API.createElement({ id: "C", y: 200, groupIds: ["g1"] }),
      ];
      const rows = buildLayerRows(elements, translate);

      expect(flattenLayerRows(rows).map((row) => row.id)).toEqual([
        "g1",
        "C",
        "B",
        "A",
      ]);
      expect(
        flattenLayerRows(rows, {
          collapsedGroupIds: new Set(["g1"]),
        }).map((row) => row.id),
      ).toEqual(["g1", "A"]);
    });

    it("filters rows by name and expands matching groups", () => {
      const elements = [
        API.createElement({ id: "A", y: 0 }),
        API.createElement({
          type: "text",
          id: "B",
          y: 100,
          text: "Needle",
          groupIds: ["g1"],
        }),
        API.createElement({ id: "C", y: 200, groupIds: ["g1"] }),
      ];
      const rows = buildLayerRows(elements, translate);

      expect(
        flattenLayerRows(rows, { query: "needle" }).map((row) => row.id),
      ).toEqual(["g1", "B"]);
      expect(flattenLayerRows(rows, { query: "nothing" })).toEqual([]);
    });
  });

  describe("selection", () => {
    it("selects every member of a group row", () => {
      const elements = [
        API.createElement({ id: "A", y: 0 }),
        API.createElement({ id: "B", y: 100, groupIds: ["g1"] }),
      ];
      const [group] = buildLayerRows(elements, translate);

      expect(getLayerRowSelection(group)).toEqual({
        selectedElementIds: { B: true },
        selectedGroupIds: { g1: true },
      });
    });
  });

  describe("visibility, locking and renaming", () => {
    it("hides and shows all group members", () => {
      const elements = [
        API.createElement({ id: "A", y: 0 }),
        API.createElement({ id: "B", y: 100, groupIds: ["g1"] }),
        API.createElement({ id: "C", y: 200, groupIds: ["g1"] }),
      ];

      const hidden = setLayerElementsHidden(elements, ["B", "C"], true);
      expect(
        isElementHidden(hidden.find((element) => element.id === "A")!),
      ).toBe(false);
      expect(
        isElementHidden(hidden.find((element) => element.id === "B")!),
      ).toBe(true);

      const shown = setLayerElementsHidden(hidden, ["B", "C"], false);
      expect(
        isElementHidden(shown.find((element) => element.id === "B")!),
      ).toBe(false);
    });

    it("toggles locking and renaming", () => {
      const elements = [API.createElement({ id: "A" })];

      const locked = setLayerElementsLocked(elements, ["A"], true);
      expect(locked[0].locked).toBe(true);

      const renamed = renameLayerElement(locked, "A", "  Header  ");
      expect(getElementLayerSettings(renamed[0]).name).toBe("Header");
      expect(buildLayerRows(renamed, translate)[0].name).toBe("Header");
    });

    it("returns the same array when nothing changes", () => {
      const elements = [API.createElement({ id: "A" })];
      expect(setLayerElementsLocked(elements, ["A"], false)).toBe(elements);
      expect(renameLayerElement(elements, "A", "")).toBe(elements);
    });
  });

  describe("reorderLayerRow", () => {
    it("moves an element above or below a sibling", () => {
      const elements = createElements();
      const rows = buildLayerRows(elements, translate);
      const rowA = rows.find((row) => row.id === "A")!;
      const rowB = rows.find((row) => row.id === "B")!;

      expect(
        reorderLayerRow(elements, rowA, rowB, "above")!.map((el) => el.id),
      ).toEqual(["B", "A", "C", "D"]);
      expect(
        reorderLayerRow(elements, rowB, rowA, "below")!.map((el) => el.id),
      ).toEqual(["B", "A", "C", "D"]);
    });

    it("keeps group members contiguous when moving a group", () => {
      const elements = [
        API.createElement({ id: "A", y: 0 }),
        API.createElement({ id: "B", y: 100, groupIds: ["g1"] }),
        API.createElement({ id: "C", y: 200, groupIds: ["g1"] }),
        API.createElement({ id: "D", y: 300 }),
      ];
      const rows = buildLayerRows(elements, translate);
      const group = rows.find((row) => row.kind === "group")!;
      const rowD = rows.find((row) => row.id === "D")!;

      expect(
        reorderLayerRow(elements, group, rowD, "above")!.map((el) => el.id),
      ).toEqual(["A", "D", "B", "C"]);
    });

    it("refuses to move rows across different parents", () => {
      const elements = [
        API.createElement({ id: "A", y: 0 }),
        API.createElement({ id: "B", y: 100, groupIds: ["g1"] }),
        API.createElement({ id: "C", y: 200, groupIds: ["g1"] }),
      ];
      const rows = buildLayerRows(elements, translate);
      const group = rows.find((row) => row.kind === "group")!;
      const rowA = rows.find((row) => row.id === "A")!;
      const rowB = group.children.find((row) => row.id === "B")!;

      expect(reorderLayerRow(elements, rowA, rowB, "above")).toBe(null);
    });
  });

  describe("persistence", () => {
    it("keeps layer settings through save and restore", () => {
      const element = setElementLayerSettings(API.createElement({ id: "A" }), {
        name: "My box",
        hidden: true,
      });

      const serialized = JSON.parse(
        serializeAsJSON([element], {}, {}, "local"),
      );
      expect(serialized.elements[0].customData.excalidrawLayers).toEqual({
        name: "My box",
        hidden: true,
      });

      const [restored] = restoreElements(serialized.elements, null);
      expect(getElementLayerSettings(restored).name).toBe("My box");
      expect(isElementHidden(restored)).toBe(true);
    });

    it("treats elements from older files as visible and unlocked", () => {
      const [restored] = restoreElements(
        [
          {
            id: "old",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          } as any,
        ],
        null,
      );
      expect(isElementHidden(restored)).toBe(false);
      expect(restored.locked).toBe(false);
    });
  });
});
