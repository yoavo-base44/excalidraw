import { act, fireEvent, render, screen, waitFor, within } from "../../tests/test-utils";

import { Excalidraw } from "../../index";
import { API } from "../../tests/helpers/api";

import type { ExcalidrawElement } from "@excalidraw/element/types";

const { h } = window;

const createElements = () => [
  API.createElement({ type: "rectangle", id: "rect", x: 0, y: 0 }),
  API.createElement({ type: "ellipse", id: "ellipse", x: 200, y: 0 }),
  API.createElement({
    type: "text",
    id: "text",
    x: 0,
    y: 200,
    text: "Hello layer",
  }),
];

const openLayersPanel = async (
  elements: ExcalidrawElement[] = createElements(),
) => {
  await render(<Excalidraw initialData={{ elements }} />);
  fireEvent.click(screen.getByTestId("layers-panel-trigger"));
  await waitFor(() => expect(screen.getByRole("tree")).toBeInTheDocument());
};

const getRow = (elementId: string) =>
  screen.getByTestId(`layer-row-${elementId}`);

const getElement = (id: string) =>
  h.elements.find((element) => element.id === id)!;

describe("layers panel", () => {
  // the panel is opened through the layers trigger in the top-right corner
  it("lists every element, topmost first", async () => {
    await openLayersPanel();

    const rows = screen.getAllByRole("treeitem");
    expect(rows.map((row) => row.dataset.layerRowId)).toEqual([
      "root:element:text",
      "root:element:ellipse",
      "root:element:rect",
    ]);
    expect(rows[0]).toHaveTextContent("Hello layer");
    expect(rows[1]).toHaveTextContent("Ellipse");
    expect(rows[2]).toHaveTextContent("Rectangle");
  });

  it("selects the element when its row is clicked", async () => {
    await openLayersPanel();

    fireEvent.click(getRow("rect"));

    await waitFor(() => {
      expect(h.state.selectedElementIds).toEqual({ rect: true });
    });
    expect(getRow("rect")).toHaveClass("layers-panel__row--selected");
  });

  it("reflects the canvas selection", async () => {
    await openLayersPanel();

    act(() => h.setState({ selectedElementIds: { ellipse: true } }));

    await waitFor(() => {
      expect(getRow("ellipse")).toHaveClass("layers-panel__row--selected");
    });
    expect(getRow("rect")).not.toHaveClass("layers-panel__row--selected");
  });

  it("hides an element, and undoes/redoes it", async () => {
    await openLayersPanel();

    fireEvent.click(screen.getByTestId("layer-visibility-rect"));

    await waitFor(() => {
      expect(getElement("rect").customData?.excalidrawLayer).toEqual({
        hidden: true,
      });
    });
    expect(
      h.app.scene.getNonDeletedElements().map((element) => element.id),
    ).toEqual(["ellipse", "text"]);
    expect(getRow("rect")).toHaveClass("layers-panel__row--hidden");

    act(() => h.app.actionManager.executeAction(h.app.actionManager.actions.undo));

    await waitFor(() => {
      expect(getElement("rect").customData).toBe(undefined);
    });
    expect(
      h.app.scene.getNonDeletedElements().map((element) => element.id),
    ).toContain("rect");

    act(() => h.app.actionManager.executeAction(h.app.actionManager.actions.redo));

    await waitFor(() => {
      expect(getElement("rect").customData?.excalidrawLayer).toEqual({
        hidden: true,
      });
    });
  });

  it("shows a hidden element again", async () => {
    await openLayersPanel([
      {
        ...API.createElement({ type: "rectangle", id: "rect" }),
        customData: { excalidrawLayer: { hidden: true } },
      },
    ]);

    expect(getRow("rect")).toHaveClass("layers-panel__row--hidden");

    fireEvent.click(screen.getByTestId("layer-visibility-rect"));

    await waitFor(() => {
      expect(getElement("rect").customData).toBe(undefined);
    });
    expect(getRow("rect")).not.toHaveClass("layers-panel__row--hidden");
  });

  it("locks and unlocks an element", async () => {
    await openLayersPanel();

    fireEvent.click(screen.getByTestId("layer-lock-rect"));

    await waitFor(() => {
      expect(getElement("rect").locked).toBe(true);
    });
    expect(getRow("rect")).toHaveClass("layers-panel__row--locked");

    fireEvent.click(screen.getByTestId("layer-lock-rect"));

    await waitFor(() => {
      expect(getElement("rect").locked).toBe(false);
    });
  });

  it("renames a layer on double click", async () => {
    await openLayersPanel();

    fireEvent.doubleClick(getRow("rect"));

    const input = screen.getByTestId("layer-rename-input");
    fireEvent.change(input, { target: { value: "Background" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(getElement("rect").customData?.excalidrawLayer).toEqual({
        name: "Background",
      });
    });
    expect(getRow("rect")).toHaveTextContent("Background");
  });

  it("reorders rows by dragging them", async () => {
    await openLayersPanel();

    expect(h.elements.map((element) => element.id)).toEqual([
      "rect",
      "ellipse",
      "text",
    ]);

    fireEvent.dragStart(getRow("rect"));
    fireEvent.dragOver(getRow("ellipse"));
    fireEvent.drop(getRow("ellipse"));

    await waitFor(() => {
      expect(h.elements.map((element) => element.id)).toEqual([
        "ellipse",
        "rect",
        "text",
      ]);
    });
    expect(screen.getAllByRole("treeitem")[1]).toBe(getRow("rect"));
  });

  it("filters rows by search", async () => {
    await openLayersPanel();

    fireEvent.change(screen.getByPlaceholderText("Find a layer..."), {
      target: { value: "ellipse" },
    });

    await waitFor(() => {
      expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    });
    expect(screen.getByTestId("layer-row-ellipse")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Find a layer..."), {
      target: { value: "nothing matches this" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("No layers match your search"),
      ).toBeInTheDocument();
    });
  });

  it("supports keyboard navigation", async () => {
    await openLayersPanel();

    const rows = screen.getAllByRole("treeitem");
    fireEvent.click(rows[0]);

    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0], { key: " " });

    await waitFor(() => {
      expect(getElement("text").customData?.excalidrawLayer).toEqual({
        hidden: true,
      });
    });
  });

  it("collapses and expands groups", async () => {
    await openLayersPanel([
      API.createElement({ type: "rectangle", id: "a", groupIds: ["group1"] }),
      API.createElement({ type: "rectangle", id: "b", groupIds: ["group1"] }),
    ]);

    expect(screen.getAllByRole("treeitem")).toHaveLength(3);
    expect(screen.getByTestId("layer-row-group1")).toHaveTextContent("Group");

    fireEvent.click(
      within(getRow("group1")).getByRole("button", { name: "Collapse" }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    });

    fireEvent.click(
      within(getRow("group1")).getByRole("button", { name: "Expand" }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("treeitem")).toHaveLength(3);
    });
  });
});
