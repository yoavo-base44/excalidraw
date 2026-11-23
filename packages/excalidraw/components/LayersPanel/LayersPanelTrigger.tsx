import clsx from "clsx";

import { DEFAULT_SIDEBAR, LAYERS_SIDEBAR_TAB } from "@excalidraw/common";

import { useUIAppState } from "../../context/ui-appState";
import { t } from "../../i18n";
import { useExcalidrawSetAppState } from "../App";
import { layersIcon } from "../icons";

/**
 * Toolbar entry point for the layers panel. Opens the default sidebar on the
 * layers tab (and closes it again when it's already showing that tab).
 */
export const LayersPanelTrigger = ({ className }: { className?: string }) => {
  const appState = useUIAppState();
  const setAppState = useExcalidrawSetAppState();

  const isOpen =
    appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
    appState.openSidebar?.tab === LAYERS_SIDEBAR_TAB;

  const title = t("layers.title");

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isOpen}
      data-testid="layers-panel-trigger"
      className={clsx("sidebar-trigger__label-element", className)}
      onClick={() => {
        document
          .querySelector(".layer-ui__wrapper")
          ?.classList.remove("animate");
        setAppState({
          openSidebar: isOpen
            ? null
            : { name: DEFAULT_SIDEBAR.name, tab: LAYERS_SIDEBAR_TAB },
          openMenu: null,
          openPopup: null,
        });
      }}
    >
      <div className="sidebar-trigger">{layersIcon}</div>
    </button>
  );
};
