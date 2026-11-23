import React from "react";

import { isElementHidden } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { createUndoAction } from "../../actions/actionHistory";
import { Excalidraw } from "../../index";
import { API } from "../../tests/helpers/api";
import { fireEvent, render, waitFor } from "../../tests/test-utils";

const { h } = window;

const query = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);

const renderLayers = async (elements: ExcalidrawElement[]) => {
  await render(
    <Excalidraw
      initialData={{
        elements,
        appState: { openSidebar: { name: "default", tab: "layers" } },
      }}
    />,
  );
  await waitFor(() => {
    expect(query('[data-testid="layers-panel"]')).not.toBeNull();
  });
};

const getRow = (id: string) =>
  query(`[data-testid="layer-row-element-${id}"]`) ??
  query(`[data-testid="layer-row-group-${id}"]`);

const getRows = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid="layers-panel"] [data-layer-row-id]',
    ),
  );

const getElement = (id: string) =>
  h.elements.find((element) => element.id === id)!;

describe("LayersPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lists layers top-most first and searches by name", async () => {
    await renderLayers([
      API.createElement({ id: "A", y: 0 }),
      API.createElement({ type: "text", id: "B", y: 100, text: "Hello" }),
    ]);

    await waitFor(() => {
      expect(getRows().map((row) => row.dataset.layerRowId)).toEqual([
        "B",
        "A",
      ]);
    });
    expect(getRows().map((row) => row.dataset.layerName)).toEqual([
      "Hello",
      "Rectangle",
    ]);

    const input = query<HTMLInputElement>(".layers-panel__search input")!;
    fireEvent.change(input, { target: { value: "hello" } });
    await waitFor(() => {
      expect(getRows().map((row) => row.dataset.layerRowId)).toEqual(["B"]);
    });

    fireEvent.change(input, { target: { value: "does not exist" } });
    await waitFor(() => {
      expect(query(".layers-panel__empty")).not.toBeNull();
    });
  });

  it("syncs row clicks with the canvas selection", async () => {
    await renderLayers([
      API.createElement({ id: "A", y: 0 }),
      API.createElement({ id: "B", y: 200 }),
    ]);

    fireEvent.click(getRow("A")!);
    await waitFor(() => {
      expect(h.state.selectedElementIds).toEqual({ A: true });
    });

    // selecting from the canvas highlights the matching row
    await waitFor(() => {
      expect(getRow("A")).toHaveAttribute("aria-selected", "true");
    });
  });

  it("hides and shows an element, with undo support", async () => {
    await renderLayers([API.createElement({ id: "A" })]);

    fireEvent.click(query('[data-testid="layer-visibility-A"]')!);
    await waitFor(() => {
      expect(isElementHidden(getElement("A"))).toBe(true);
    });
    expect(API.getUndoStack().length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(
        (h.app as any).visibleElements.map(
          (element: ExcalidrawElement) => element.id,
        ),
      ).not.toContain("A");
    });

    API.executeAction(createUndoAction(h.history));
    await waitFor(() => {
      expect(isElementHidden(getElement("A"))).toBe(false);
    });
  });

  it("locks and unlocks an element", async () => {
    await renderLayers([API.createElement({ id: "A" })]);

    fireEvent.click(query('[data-testid="layer-lock-A"]')!);
    await waitFor(() => {
      expect(getElement("A").locked).toBe(true);
    });

    fireEvent.click(query('[data-testid="layer-lock-A"]')!);
    await waitFor(() => {
      expect(getElement("A").locked).toBe(false);
    });
  });

  it("selects a whole group and collapses its members", async () => {
    await renderLayers([
      API.createElement({ id: "A", y: 0 }),
      API.createElement({ id: "B", y: 100, groupIds: ["g1"] }),
      API.createElement({ id: "C", y: 200, groupIds: ["g1"] }),
    ]);

    const groupRow = getRow("g1")!;
    expect(groupRow).not.toBeNull();

    fireEvent.click(groupRow);
    await waitFor(() => {
      expect(h.state.selectedGroupIds).toEqual({ g1: true });
      expect(h.state.selectedElementIds).toEqual({ B: true, C: true });
    });

    fireEvent.click(groupRow.querySelector(".layers-panel__chevron")!);
    await waitFor(() => {
      expect(getRow("B")).toBeNull();
      expect(getRow("C")).toBeNull();
    });
  });

  it("supports keyboard navigation, selection and reordering", async () => {
    await renderLayers([
      API.createElement({ id: "A", y: 0 }),
      API.createElement({ id: "B", y: 200 }),
    ]);

    const topRow = getRow("B")!;
    topRow.focus();
    fireEvent.keyDown(topRow, { key: "ArrowDown" });
    expect(document.activeElement).toBe(getRow("A"));

    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    await waitFor(() => {
      expect(h.state.selectedElementIds).toEqual({ A: true });
    });

    // Alt+ArrowUp moves the row above its sibling in z-order
    fireEvent.keyDown(getRow("A")!, { key: "ArrowUp", altKey: true });
    await waitFor(() => {
      expect(h.elements.map((element) => element.id)).toEqual(["B", "A"]);
    });
  });

  it("reorders layers with drag and drop", async () => {
    await renderLayers([
      API.createElement({ id: "A", y: 0 }),
      API.createElement({ id: "B", y: 200 }),
    ]);

    const dataTransfer = {
      setData: () => {},
      getData: () => "A",
      effectAllowed: "move",
      dropEffect: "move",
    };

    fireEvent.dragStart(getRow("A")!, { dataTransfer });
    fireEvent.dragOver(getRow("B")!, { dataTransfer, clientY: -1 });
    fireEvent.drop(getRow("B")!, { dataTransfer });

    await waitFor(() => {
      expect(h.elements.map((element) => element.id)).toEqual(["B", "A"]);
    });
  });
});
