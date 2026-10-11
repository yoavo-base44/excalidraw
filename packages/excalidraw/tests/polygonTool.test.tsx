import React from "react";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, fireEvent, GlobalTestState, render } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const selectPolygon = () => {
  fireEvent.click(
    GlobalTestState.renderResult.container.querySelector(
      ".App-toolbar__extra-tools-trigger",
    )!,
  );
  UI.clickOnTestId("toolbar-polygon");
};

const finish = (pointer: Pointer, x: number, y: number) => {
  pointer.clickAt(x, y);
  pointer.clickAt(x, y);
  pointer.doubleClickAt(x, y);
};

describe("polygon drawing tool", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    mouse.reset();
    selectPolygon();
  });

  it("connects clicked vertices and closes on double-click without a duplicate vertex", () => {
    API.setAppState({ currentItemRoundness: "round" });
    mouse.clickAt(100, 100);
    mouse.moveTo(200, 100);
    mouse.clickAt(200, 100);
    mouse.moveTo(200, 200);
    expect(h.state.multiElement).not.toBeNull();
    finish(mouse, 200, 200);

    expect(h.elements).toHaveLength(1);
    expect(h.elements[0]).toMatchObject({
      type: "line",
      polygon: true,
      roundness: null,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 0],
      ],
    });
    expect(h.state.multiElement).toBeNull();
    expect(h.state.activeTool.type).toBe("selection");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("accepts points without hover, including on touch screens", () => {
    const touch = new Pointer("touch");
    touch.clickAt(100, 100);
    touch.clickAt(200, 100);
    touch.clickAt(200, 200);
    finish(touch, 100, 200);
    expect(h.elements[0]).toMatchObject({
      polygon: true,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
    });
  });

  it("keeps drawing when double-clicked with fewer than three vertices", () => {
    mouse.clickAt(100, 100);
    finish(mouse, 200, 100);
    expect(h.state.multiElement).not.toBeNull();
    expect(h.state.activeTool.type).toBe("polygon");
    finish(mouse, 200, 200);
    expect(h.elements[0]).toMatchObject({ polygon: true });
  });

  it("discards an unfinished two-point shape when switching tools", () => {
    mouse.clickAt(100, 100);
    mouse.clickAt(200, 100);
    act(() => h.app.setActiveTool({ type: "rectangle" }));
    expect(h.app.scene.getNonDeletedElements()).toHaveLength(0);
  });

  it("preserves closure through undo and redo", () => {
    mouse.clickAt(100, 100);
    mouse.clickAt(200, 100);
    finish(mouse, 200, 200);
    const id = h.elements[0].id;
    Keyboard.undo();
    Keyboard.redo();
    expect(
      h.app.scene.getNonDeletedElements().find((el) => el.id === id),
    ).toMatchObject({
      polygon: true,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 0],
      ],
    });
  });

  it("keeps the polygon tool active when locked", () => {
    act(() => h.app.setActiveTool({ type: "polygon", locked: true }));
    mouse.clickAt(100, 100);
    mouse.clickAt(200, 100);
    finish(mouse, 200, 200);
    expect(h.state.activeTool.type).toBe("polygon");
    expect(h.state.multiElement).toBeNull();
  });

  it("does not automatically close the normal line tool", () => {
    UI.clickTool("line");
    mouse.click(100, 100);
    mouse.click(100, 0);
    mouse.click(0, 100);
    Keyboard.keyPress("Enter");
    expect(h.elements[0]).toMatchObject({ type: "line", polygon: false });
  });
});
