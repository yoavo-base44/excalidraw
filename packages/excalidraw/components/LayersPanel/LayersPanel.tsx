import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type React from "react";

import { DEFAULT_SIDEBAR, KEYS, LAYERS_SIDEBAR_TAB } from "@excalidraw/common";

import { selectGroupsForSelectedElements } from "@excalidraw/element";

import type { ExcalidrawElement, Theme } from "@excalidraw/element/types";

import {
  actionMoveLayer,
  actionRenameLayer,
  actionToggleLayerLock,
  actionToggleLayerVisibility,
} from "../../actions/actionLayers";
import { useUIAppState } from "../../context/ui-appState";
import { t } from "../../i18n";

import {
  useApp,
  useExcalidrawActionManager,
  useExcalidrawSetAppState,
} from "../App";
import { TextField } from "../TextField";
import {
  ArrowIcon,
  DiamondIcon,
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
  collapseDownIcon,
  eyeClosedIcon,
  eyeIcon,
  frameToolIcon,
  layersIcon,
  searchIcon,
} from "../icons";

import {
  buildLayerTree,
  filterLayerTree,
  flattenLayerTree,
  getLayerLabel,
} from "./layerTree";

import "./LayersPanel.scss";

import type { LayerTreeNode } from "./layerTree";

const ELEMENT_TYPE_ICONS: Record<string, React.ReactNode> = {
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

const getTypeLabel = (element: ExcalidrawElement): string => {
  switch (element.type) {
    case "rectangle":
      return t("element.rectangle");
    case "diamond":
      return t("element.diamond");
    case "ellipse":
      return t("element.ellipse");
    case "arrow":
      return t("element.arrow");
    case "line":
      return t("element.line");
    case "freedraw":
      return t("element.freedraw");
    case "text":
      return t("element.text");
    case "image":
      return t("element.image");
    case "frame":
    case "magicframe":
      return t("element.frame");
    case "embeddable":
      return t("element.embeddable");
    case "iframe":
      return t("element.iframe");
    default:
      return element.type;
  }
};

const getRowIcon = (node: LayerTreeNode, theme: Theme) => {
  if (node.kind === "group") {
    return <GroupIcon theme={theme} />;
  }
  const element = node.element!;
  return ELEMENT_TYPE_ICONS[element.type] || TextIcon;
};

type DropTarget = {
  nodeId: string;
  position: "before" | "after";
};

/**
 * Collapsible layers panel: a searchable list of the scene elements (topmost
 * first) with visibility, locking, renaming and drag-to-reorder controls.
 */
export const LayersPanel = () => {
  const app = useApp();
  const appState = useUIAppState();
  const setAppState = useExcalidrawSetAppState();
  const actionManager = useExcalidrawActionManager();

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // the scene is the source of truth for the panel, so re-render whenever it
  // changes (renames, visibility, z-order, …)
  const [, setSceneNonce] = useState(0);
  useEffect(() => {
    const unsubscribe = app.scene.onUpdate(() => {
      setSceneNonce((nonce) => nonce + 1);
    });

    return () => {
      try {
        unsubscribe();
      } catch {
        // the scene was already destroyed (app unmounting)
      }
    };
  }, [app]);

  const allElements = app.scene.getElementsIncludingDeleted();
  const elementsMap = useMemo(
    () => new Map(allElements.map((element) => [element.id, element])),
    [allElements],
  );

  const tree = useMemo(() => {
    return buildLayerTree(allElements, {
      labelForElement: (element) =>
        getLayerLabel(element, elementsMap, getTypeLabel),
      groupLabel: t("element.group"),
    });
  }, [allElements, elementsMap]);

  const filteredTree = useMemo(
    () => filterLayerTree(tree, query),
    [tree, query],
  );

  const isSearching = !!query.trim();

  const rows = useMemo(
    () =>
      flattenLayerTree(
        filteredTree,
        isSearching ? new Set<string>() : collapsed,
      ),
    [filteredTree, collapsed, isSearching],
  );

  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows],
  );

  const isRowSelected = (node: LayerTreeNode) =>
    node.elementIds.length > 0 &&
    node.elementIds.every((id) => appState.selectedElementIds[id]);

  const isRowPartiallySelected = (node: LayerTreeNode) =>
    !isRowSelected(node) &&
    node.elementIds.some((id) => appState.selectedElementIds[id]);

  const toggleCollapsed = useCallback((node: LayerTreeNode) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }, []);

  const selectRow = (node: LayerTreeNode, event: { shiftKey: boolean; [key: string]: any }) => {
    const additive = event.shiftKey || !!event[KEYS.CTRL_OR_CMD];

    setAppState((prev) => {
      const nextSelectedElementIds: Record<string, true> = additive
        ? { ...prev.selectedElementIds }
        : {};

      const isSelected = node.elementIds.every(
        (id) => prev.selectedElementIds[id],
      );
      const shouldSelect = !(additive && isSelected);

      for (const id of node.elementIds) {
        if (shouldSelect) {
          nextSelectedElementIds[id] = true;
        } else {
          delete nextSelectedElementIds[id];
        }
      }

      if (node.kind === "group") {
        return {
          ...selectGroupsForSelectedElements(
            {
              editingGroupId: prev.editingGroupId,
              selectedElementIds: nextSelectedElementIds,
            },
            app.scene.getNonDeletedElements(),
            prev,
            app,
          ),
          selectedElementIds: nextSelectedElementIds,
        };
      }

      return {
        selectedElementIds: nextSelectedElementIds,
        selectedGroupIds: additive ? prev.selectedGroupIds : {},
        editingGroupId: prev.editingGroupId,
      };
    });
  };

  const toggleVisibility = (node: LayerTreeNode) => {
    actionManager.executeAction(actionToggleLayerVisibility, "ui", {
      elementIds: node.elementIds,
    });
  };

  const toggleLock = (node: LayerTreeNode) => {
    actionManager.executeAction(actionToggleLayerLock, "ui", {
      elementIds: node.elementIds,
    });
  };

  const startRename = (node: LayerTreeNode) => {
    if (node.kind !== "element") {
      return;
    }
    setRenamingId(node.id);
    setRenameValue(node.label);
  };

  const commitRename = (node: LayerTreeNode) => {
    if (node.kind === "element" && renamingId === node.id) {
      actionManager.executeAction(actionRenameLayer, "ui", {
        elementId: node.sourceId,
        name: renameValue,
      });
    }
    setRenamingId(null);
  };

  const focusRowAt = (index: number) => {
    const nextRow = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (nextRow) {
      setFocusedRowId(nextRow.id);
      rowRefs.current.get(nextRow.id)?.focus();
    }
  };

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    node: LayerTreeNode,
    index: number,
  ) => {
    if (renamingId === node.id) {
      return;
    }

    switch (event.key) {
      case KEYS.ARROW_DOWN:
        event.preventDefault();
        focusRowAt(index + 1);
        break;
      case KEYS.ARROW_UP:
        event.preventDefault();
        focusRowAt(index - 1);
        break;
      case KEYS.ARROW_RIGHT:
        if (node.children.length) {
          event.preventDefault();
          if (collapsed.has(node.id)) {
            toggleCollapsed(node);
          } else {
            focusRowAt(index + 1);
          }
        }
        break;
      case KEYS.ARROW_LEFT:
        event.preventDefault();
        if (node.children.length && !collapsed.has(node.id)) {
          toggleCollapsed(node);
        } else if (node.parentId) {
          const parentIndex = rows.findIndex((row) => row.id === node.parentId);
          if (parentIndex !== -1) {
            focusRowAt(parentIndex);
          }
        }
        break;
      case KEYS.ENTER:
        event.preventDefault();
        selectRow(node, event);
        break;
      case KEYS.SPACE:
        event.preventDefault();
        toggleVisibility(node);
        break;
      case KEYS.L:
        event.preventDefault();
        toggleLock(node);
        break;
      case "F2":
        event.preventDefault();
        startRename(node);
        break;
      default:
        break;
    }
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    node: LayerTreeNode,
  ) => {
    setDragNodeId(node.id);
    event.dataTransfer?.setData("text/plain", node.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    node: LayerTreeNode,
  ) => {
    const draggingNode = dragNodeId ? rowsById.get(dragNodeId) : null;
    if (
      !draggingNode ||
      draggingNode.id === node.id ||
      draggingNode.parentId !== node.parentId
    ) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const position =
      event.clientY - rect.top < rect.height / 2 ? "before" : "after";
    setDropTarget({ nodeId: node.id, position });
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    node: LayerTreeNode,
  ) => {
    event.preventDefault();
    const draggingNode = dragNodeId ? rowsById.get(dragNodeId) : null;

    if (
      draggingNode &&
      dropTarget?.nodeId === node.id &&
      draggingNode.parentId === node.parentId
    ) {
      actionManager.executeAction(actionMoveLayer, "ui", {
        elementIds: draggingNode.elementIds,
        targetElementIds: node.elementIds,
        position: dropTarget.position,
      });
    }

    setDragNodeId(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDragNodeId(null);
    setDropTarget(null);
  };

  return (
    <div className="layers-panel">
      <div className="layers-panel__header">
        <TextField
          type="search"
          fullWidth
          placeholder={t("labels.layersPanel.searchPlaceholder")}
          icon={searchIcon}
          value={query}
          onChange={(value) => setQuery(value)}
        />
      </div>
      {rows.length ? (
        <div
          className="layers-panel__rows"
          role="tree"
          aria-label={t("labels.layersPanel.title")}
        >
          {rows.map((node, index) => {
            const selected = isRowSelected(node);
            const partiallySelected = isRowPartiallySelected(node);
            const isCollapsed = collapsed.has(node.id);
            const isDropTarget = dropTarget?.nodeId === node.id;

            return (
              <div
                key={node.id}
                ref={(element) => {
                  if (element) {
                    rowRefs.current.set(node.id, element);
                  } else {
                    rowRefs.current.delete(node.id);
                  }
                }}
                role="treeitem"
                aria-level={node.depth + 1}
                aria-selected={selected}
                aria-expanded={
                  node.children.length ? !isCollapsed : undefined
                }
                data-testid={`layer-row-${node.sourceId}`}
                data-layer-row-id={node.id}
                tabIndex={focusedRowId === node.id ? 0 : -1}
                draggable={renamingId !== node.id}
                className={clsx("layers-panel__row", {
                  "layers-panel__row--selected": selected,
                  "layers-panel__row--partially-selected":
                    partiallySelected,
                  "layers-panel__row--hidden": node.hidden,
                  "layers-panel__row--locked": node.locked,
                  "layers-panel__row--group": node.kind === "group",
                  "layers-panel__row--dragging": dragNodeId === node.id,
                  "layers-panel__row--drop-before":
                    isDropTarget && dropTarget?.position === "before",
                  "layers-panel__row--drop-after":
                    isDropTarget && dropTarget?.position === "after",
                })}
                style={{ paddingInlineStart: `${node.depth * 14}px` }}
                onClick={(event) => {
                  setFocusedRowId(node.id);
                  if (renamingId !== node.id) {
                    selectRow(node, event);
                  }
                }}
                onDoubleClick={() => {
                  if (node.children.length) {
                    toggleCollapsed(node);
                  } else {
                    startRename(node);
                  }
                }}
                onKeyDown={(event) => handleRowKeyDown(event, node, index)}
                onDragStart={(event) => handleDragStart(event, node)}
                onDragOver={(event) => handleDragOver(event, node)}
                onDrop={(event) => handleDrop(event, node)}
                onDragEnd={handleDragEnd}
              >
                {node.children.length ? (
                  <button
                    type="button"
                    className={clsx("layers-panel__chevron", {
                      "layers-panel__chevron--collapsed": isCollapsed,
                    })}
                    aria-label={
                      isCollapsed
                        ? t("labels.layersPanel.expand")
                        : t("labels.layersPanel.collapse")
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCollapsed(node);
                    }}
                  >
                    {collapseDownIcon}
                  </button>
                ) : (
                  <span className="layers-panel__chevron-spacer" />
                )}
                <span className="layers-panel__icon">
                  {getRowIcon(node, appState.theme)}
                </span>
                {renamingId === node.id ? (
                  <input
                    className="layers-panel__rename-input"
                    autoFocus
                    value={renameValue}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={() => commitRename(node)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === KEYS.ENTER) {
                        commitRename(node);
                      } else if (event.key === KEYS.ESCAPE) {
                        setRenamingId(null);
                      }
                    }}
                    data-testid="layer-rename-input"
                  />
                ) : (
                  <span className="layers-panel__label" title={node.label}>
                    {node.label}
                  </span>
                )}
                <span className="layers-panel__actions">
                  <button
                    type="button"
                    className={clsx("layers-panel__action", {
                      "layers-panel__action--active": node.hidden,
                    })}
                    aria-label={t("labels.layersPanel.toggleVisibility")}
                    aria-pressed={node.hidden}
                    title={t("labels.layersPanel.toggleVisibility")}
                    data-testid={`layer-visibility-${node.sourceId}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleVisibility(node);
                    }}
                  >
                    {node.hidden ? eyeClosedIcon : eyeIcon}
                  </button>
                  <button
                    type="button"
                    className={clsx("layers-panel__action", {
                      "layers-panel__action--active": node.locked,
                    })}
                    aria-label={t("labels.layersPanel.toggleLock")}
                    aria-pressed={node.locked}
                    title={t("labels.layersPanel.toggleLock")}
                    data-testid={`layer-lock-${node.sourceId}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleLock(node);
                    }}
                  >
                    {node.locked ? LockedIcon : UnlockedIcon}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="layers-panel__empty">
          {isSearching
            ? t("labels.layersPanel.noMatch")
            : t("labels.layersPanel.empty")}
        </div>
      )}
    </div>
  );
};

export const LayersPanelTrigger = ({ className }: { className?: string }) => {
  const appState = useUIAppState();
  const setAppState = useExcalidrawSetAppState();

  const isOpen =
    appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
    appState.openSidebar?.tab === LAYERS_SIDEBAR_TAB;

  return (
    <button
      type="button"
      title={t("labels.layersPanel.title")}
      className="sidebar-trigger__label-element"
      aria-label={t("labels.layersPanel.title")}
      aria-pressed={isOpen}
      data-testid="layers-panel-trigger"
      onClick={() => {
        setAppState({
          openSidebar: isOpen
            ? null
            : { name: DEFAULT_SIDEBAR.name, tab: LAYERS_SIDEBAR_TAB },
          openMenu: null,
          openPopup: null,
        });
      }}
    >
      <div className={clsx("sidebar-trigger", className)}>{layersIcon}</div>
    </button>
  );
};

LayersPanel.displayName = "LayersPanel";
LayersPanelTrigger.displayName = "LayersPanelTrigger";
