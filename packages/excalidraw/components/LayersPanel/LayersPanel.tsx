import clsx from "clsx";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { arrayToMap } from "@excalidraw/common";

import { CaptureUpdateAction, syncMovedIndices } from "@excalidraw/element";

import type { CaptureUpdateActionType } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { useExcalidrawAPI, useExcalidrawElements } from "../App";
import { TextField } from "../TextField";
import { useUIAppState } from "../../context/ui-appState";
import { t } from "../../i18n";
import {
  ArrowIcon,
  DiamondIcon,
  DotsIcon,
  EllipseIcon,
  EmbedIcon,
  FreedrawIcon,
  GroupIcon,
  ImageIcon,
  LineIcon,
  LockedIcon,
  RectangleIcon,
  TextIcon,
  UnlockedIcon,
  chevronDownIcon,
  chevronRight,
  eyeClosedIcon,
  eyeIcon,
  frameToolIcon,
  searchIcon,
} from "../icons";

import {
  buildLayerRows,
  findLayerRowLocation,
  flattenLayerRows,
  getLayerRowSelection,
  renameLayerElement,
  reorderLayerRow,
  setLayerElementsHidden,
  setLayerElementsLocked,
} from "./layers";

import "./LayersPanel.scss";

import type { LayerRow } from "./layers";

const ROW_ICONS: Record<string, React.ReactNode> = {
  rectangle: RectangleIcon,
  diamond: DiamondIcon,
  ellipse: EllipseIcon,
  arrow: ArrowIcon,
  line: LineIcon,
  freedraw: FreedrawIcon,
  text: TextIcon,
  image: ImageIcon,
  frame: frameToolIcon,
  magicframe: frameToolIcon,
  embeddable: EmbedIcon,
  iframe: EmbedIcon,
};

const getRowIcon = (row: LayerRow, theme: "light" | "dark") => {
  if (row.kind === "group") {
    return <GroupIcon theme={theme} />;
  }
  return ROW_ICONS[row.element.type] ?? null;
};

export const LayersPanel = () => {
  const app = useExcalidrawAPI();
  const elements = useExcalidrawElements();
  const appState = useUIAppState();

  const [query, setQuery] = useState("");
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [renamingRowId, setRenamingRowId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [drag, setDrag] = useState<{
    rowId: string;
    overRowId: string | null;
    placement: "above" | "below";
  } | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildLayerRows(elements, t), [elements]);
  const visibleRows = useMemo(
    () => flattenLayerRows(rows, { collapsedGroupIds, query }),
    [rows, collapsedGroupIds, query],
  );

  const activeIndex = Math.max(
    0,
    visibleRows.findIndex((row) => row.id === activeRowId),
  );

  useEffect(() => {
    if (renamingRowId && !visibleRows.some((row) => row.id === renamingRowId)) {
      setRenamingRowId(null);
    }
  }, [renamingRowId, visibleRows]);

  const focusRow = (rowId: string) => {
    setActiveRowId(rowId);
    const rowElement = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-layer-row-id]") ??
        [],
    ).find((element) => element.dataset.layerRowId === rowId);
    rowElement?.focus();
  };

  const updateElements = (
    nextElements: readonly ExcalidrawElement[],
    nextAppState?: Record<string, unknown>,
    captureUpdate: CaptureUpdateActionType = CaptureUpdateAction.IMMEDIATELY,
  ) => {
    if (!app) {
      return;
    }
    app.updateScene({
      elements: nextElements,
      appState: nextAppState as any,
      captureUpdate,
    });
  };

  const selectRow = (row: LayerRow) => {
    if (!app) {
      return;
    }
    app.updateScene({
      appState: {
        ...getLayerRowSelection(row),
        editingGroupId: null,
        selectedLinearElement: null,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const toggleHidden = (row: LayerRow) => {
    const hidden = !row.hidden;
    const nextElements = setLayerElementsHidden(
      elements,
      row.hiddenElementIds,
      hidden,
    );
    let nextAppState: Record<string, unknown> | undefined;
    if (hidden) {
      const selectedElementIds = { ...appState.selectedElementIds };
      for (const elementId of row.hiddenElementIds) {
        delete selectedElementIds[elementId];
      }
      nextAppState = { selectedElementIds };
    }
    updateElements(nextElements, nextAppState);
  };

  const toggleLocked = (row: LayerRow) => {
    updateElements(
      setLayerElementsLocked(elements, row.elementIds, !row.locked),
    );
  };

  const toggleCollapsed = (groupId: string) => {
    setCollapsedGroupIds((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const startRename = (row: LayerRow) => {
    if (row.kind !== "element") {
      return;
    }
    setActiveRowId(row.id);
    setRenamingRowId(row.id);
    setRenameValue(row.name);
  };

  const commitRename = (row: LayerRow) => {
    if (row.kind !== "element") {
      return;
    }
    const nextElements = renameLayerElement(elements, row.id, renameValue);
    if (nextElements !== elements) {
      updateElements(nextElements);
    }
    setRenamingRowId(null);
  };

  const moveRow = (
    row: LayerRow,
    target: LayerRow,
    placement: "above" | "below",
  ) => {
    const nextElements = reorderLayerRow(elements, row, target, placement);
    if (!nextElements) {
      return;
    }
    const movedElements = nextElements.filter((element) =>
      row.elementIds.includes(element.id),
    );
    updateElements(syncMovedIndices(nextElements, arrayToMap(movedElements)));
  };

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    row: LayerRow,
    index: number,
  ) => {
    if (event.target instanceof HTMLInputElement) {
      return;
    }

    const location = findLayerRowLocation(rows, row.id);
    if (!location) {
      return;
    }

    const focusVisibleRow = (nextIndex: number) => {
      const nextRow = visibleRows[nextIndex];
      if (nextRow) {
        focusRow(nextRow.id);
      }
    };

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        if (event.altKey) {
          const target = location.siblings[location.index + 1];
          if (target) {
            moveRow(row, target, "below");
          }
        } else {
          focusVisibleRow(Math.min(index + 1, visibleRows.length - 1));
        }
        return;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        if (event.altKey) {
          const target = location.siblings[location.index - 1];
          if (target) {
            moveRow(row, target, "above");
          }
        } else {
          focusVisibleRow(Math.max(index - 1, 0));
        }
        return;
      case "Home":
        event.preventDefault();
        event.stopPropagation();
        focusVisibleRow(0);
        return;
      case "End":
        event.preventDefault();
        event.stopPropagation();
        focusVisibleRow(visibleRows.length - 1);
        return;
      case "ArrowRight":
        if (row.kind === "group") {
          event.preventDefault();
          event.stopPropagation();
          if (collapsedGroupIds.has(row.groupId)) {
            toggleCollapsed(row.groupId);
          } else if (row.children.length) {
            focusVisibleRow(index + 1);
          }
        }
        return;
      case "ArrowLeft":
        event.preventDefault();
        event.stopPropagation();
        if (row.kind === "group" && !collapsedGroupIds.has(row.groupId)) {
          toggleCollapsed(row.groupId);
        } else if (row.parentGroupId) {
          focusRow(row.parentGroupId);
        }
        return;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        selectRow(row);
        return;
      case " ":
        event.preventDefault();
        event.stopPropagation();
        toggleHidden(row);
        return;
      case "l":
      case "L":
        event.preventDefault();
        event.stopPropagation();
        toggleLocked(row);
        return;
      case "F2":
        event.preventDefault();
        event.stopPropagation();
        startRename(row);
        break;

      default:
        break;
    }
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    target: LayerRow,
  ) => {
    event.preventDefault();
    const rowId = drag?.rowId ?? event.dataTransfer.getData("text/plain");
    setDrag(null);
    if (!rowId || rowId === target.id) {
      return;
    }
    const location = findLayerRowLocation(rows, rowId);
    if (!location) {
      return;
    }
    moveRow(location.row, target, drag?.placement ?? "above");
  };

  const isRowSelected = (row: LayerRow) =>
    row.elementIds.length > 0 &&
    row.elementIds.every((elementId) => appState.selectedElementIds[elementId]);

  const renderRow = (row: LayerRow, index: number) => {
    const isGroup = row.kind === "group";
    const isCollapsed = isGroup && collapsedGroupIds.has(row.groupId);
    const isSelected = isRowSelected(row);
    const isRenaming = renamingRowId === row.id;

    return (
      <div
        key={row.id}
        role="treeitem"
        aria-level={row.depth + 1}
        aria-selected={isSelected}
        aria-expanded={isGroup ? !isCollapsed : undefined}
        aria-label={row.name}
        tabIndex={index === activeIndex ? 0 : -1}
        data-layer-row-id={row.id}
        data-layer-name={row.name}
        data-layer-kind={row.kind}
        data-testid={`layer-row-${row.kind}-${row.id}`}
        className={clsx("layers-panel__row", {
          "layers-panel__row--selected": isSelected,
          "layers-panel__row--hidden": row.hidden,
          "layers-panel__row--dragging": drag?.rowId === row.id,
          "layers-panel__row--drop-above":
            drag?.overRowId === row.id && drag.placement === "above",
          "layers-panel__row--drop-below":
            drag?.overRowId === row.id && drag.placement === "below",
        })}
        style={{ "--layer-depth": row.depth } as React.CSSProperties}
        draggable={!isRenaming}
        onClick={() => {
          setActiveRowId(row.id);
          selectRow(row);
        }}
        onDoubleClick={() => startRename(row)}
        onKeyDown={(event) => handleRowKeyDown(event, row, index)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", row.id);
          setDrag({ rowId: row.id, overRowId: null, placement: "above" });
        }}
        onDragOver={(event) => {
          if (!drag?.rowId || drag.rowId === row.id) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          const placement =
            event.clientY < rect.top + rect.height / 2 ? "above" : "below";
          if (drag.overRowId !== row.id || drag.placement !== placement) {
            setDrag({ ...drag, overRowId: row.id, placement });
          }
        }}
        onDrop={(event) => handleDrop(event, row)}
        onDragEnd={() => setDrag(null)}
      >
        <span className="layers-panel__drag-handle" aria-hidden="true">
          {DotsIcon}
        </span>
        {isGroup ? (
          <button
            type="button"
            className="layers-panel__chevron"
            aria-label={isCollapsed ? t("layers.expand") : t("layers.collapse")}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapsed(row.groupId);
            }}
          >
            {isCollapsed ? chevronRight : chevronDownIcon}
          </button>
        ) : (
          <span className="layers-panel__chevron-spacer" aria-hidden="true" />
        )}
        <span className="layers-panel__icon" aria-hidden="true">
          {getRowIcon(row, appState.theme)}
        </span>
        {isRenaming ? (
          <input
            className="layers-panel__rename-input"
            value={renameValue}
            autoFocus
            aria-label={t("layers.rename")}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={() => commitRename(row)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                commitRename(row);
              } else if (event.key === "Escape") {
                setRenamingRowId(null);
              }
            }}
          />
        ) : (
          <span className="layers-panel__name" title={row.name}>
            {row.name}
          </span>
        )}
        {isGroup && (
          <span className="layers-panel__count">{row.elementIds.length}</span>
        )}
        <span className="layers-panel__actions">
          <button
            type="button"
            className={clsx("layers-panel__action", {
              "layers-panel__action--active": row.hidden,
            })}
            aria-label={row.hidden ? t("layers.show") : t("layers.hide")}
            aria-pressed={row.hidden}
            title={row.hidden ? t("layers.show") : t("layers.hide")}
            data-testid={`layer-visibility-${row.id}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleHidden(row);
            }}
          >
            {row.hidden ? eyeClosedIcon : eyeIcon}
          </button>
          <button
            type="button"
            className={clsx("layers-panel__action", {
              "layers-panel__action--active": row.locked,
            })}
            aria-label={row.locked ? t("layers.unlock") : t("layers.lock")}
            aria-pressed={row.locked}
            title={row.locked ? t("layers.unlock") : t("layers.lock")}
            data-testid={`layer-lock-${row.id}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleLocked(row);
            }}
          >
            {row.locked ? LockedIcon : UnlockedIcon}
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="layers-panel" data-testid="layers-panel">
      <div className="layers-panel__search">
        <TextField
          value={query}
          onChange={setQuery}
          placeholder={t("layers.searchPlaceholder")}
          icon={searchIcon}
          type="search"
          fullWidth
        />
      </div>
      {rows.length === 0 ? (
        <div className="layers-panel__empty">{t("layers.empty")}</div>
      ) : visibleRows.length === 0 ? (
        <div className="layers-panel__empty">{t("layers.noResults")}</div>
      ) : (
        <div
          ref={listRef}
          className="layers-panel__list"
          role="tree"
          aria-label={t("layers.title")}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              setQuery("");
            }
          }}
        >
          {visibleRows.map(renderRow)}
        </div>
      )}
    </div>
  );
};
