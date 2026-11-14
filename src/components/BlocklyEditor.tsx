import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import { registerBlocks } from '../blocks/definitions';
import { TOOLBOX } from '../blocks/toolbox';
import { ensureStart, syncObjects, afterWorkspaceReplaced } from '../blocks/sync';
import { setupHoverHighlight } from '../blocks/highlight';
import type { WorkspaceState } from '../codegen/generate';

const darkTheme = Blockly.Theme.defineTheme('manimDark', {
  name: 'manimDark',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#16131f', toolboxBackgroundColour: '#1c1828', toolboxForegroundColour: '#e9e4f7',
    flyoutBackgroundColour: '#221d31', flyoutForegroundColour: '#e9e4f7', flyoutOpacity: 1,
    scrollbarColour: '#6b5aa8', scrollbarOpacity: 0.5, insertionMarkerColour: '#ffffff', insertionMarkerOpacity: 0.3,
    cursorColour: '#c4a1ff',
  },
  fontStyle: { family: 'Segoe UI, system-ui, sans-serif', weight: '600', size: 11 },
});

const lightTheme = Blockly.Theme.defineTheme('manimLight', {
  name: 'manimLight',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#f4f2fa', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#241e35',
    flyoutBackgroundColour: '#ece8f7', flyoutForegroundColour: '#241e35', flyoutOpacity: 1,
    scrollbarColour: '#9a86d9', scrollbarOpacity: 0.5, insertionMarkerColour: '#000000', insertionMarkerOpacity: 0.25, cursorColour: '#5b32c9',
  },
  fontStyle: { family: 'Segoe UI, system-ui, sans-serif', weight: '600', size: 11 },
});

interface Props {
  theme: 'dark' | 'light';
  /** false: the block palette is always visible. true: it only shows while the mouse is over the category list or the palette. */
  autoHidePalette: boolean;
  onReady: (ws: Blockly.WorkspaceSvg) => void;
  onChange: (state: WorkspaceState) => void;
}

const HIDE_DELAY_MS = 180;

/** Palette behaviour. Returns a function that applies the current mode and one that removes the listeners. */
function setupPalette(ws: Blockly.WorkspaceSvg, host: HTMLElement, getAutoHide: () => boolean) {
  const toolbox = ws.getToolbox() as Blockly.Toolbox;
  const flyout = toolbox.getFlyout() as Blockly.Flyout;
  const selectable = () => toolbox.getToolboxItems().filter((i) => i.isSelectable()) as Blockly.ISelectableToolboxItem[];
  let inside = false;            // mouse is over the category list or the palette
  let closing = false;           // we are closing the palette on purpose
  let timer: number | undefined;

  const open = (item: Blockly.ISelectableToolboxItem) => { if (toolbox.getSelectedItem() !== item) toolbox.setSelectedItem(item); };
  const close = () => { closing = true; try { toolbox.clearSelection(); } finally { closing = false; } };

  const apply = () => {
    const auto = getAutoHide();
    flyout.setAutoClose(auto);
    if (auto) { if (!inside && toolbox.getSelectedItem()) close(); }
    else if (!toolbox.getSelectedItem()) { const first = selectable()[0]; if (first) open(first); }
    Blockly.svgResize(ws);
  };

  // Clicking an already open category would normally close it; keep it open unless we are the ones closing it.
  // Ovals already built into palette blocks take the color of the block they are in.
  const recolourPalette = () => {
    for (const b of flyout.getWorkspace().getBlocksByType('obj_ref', false) as (Blockly.Block & { recolour_?: () => void })[]) b.recolour_?.();
  };
  const onSelect = (e: Blockly.Events.Abstract) => {
    if (e.type === Blockly.Events.TOOLBOX_ITEM_SELECT) { recolourPalette(); setTimeout(recolourPalette, 0); }
    if (e.type !== Blockly.Events.TOOLBOX_ITEM_SELECT || closing) return;
    const ev = e as Blockly.Events.ToolboxItemSelect;
    if (ev.newItem || !ev.oldItem) return;
    if (!getAutoHide() || inside) {
      const back = selectable().find((i) => i.getName() === ev.oldItem);
      if (back) setTimeout(() => open(back), 0);
    }
  };
  ws.addChangeListener(onSelect);

  const toolboxEl = host.querySelector<HTMLElement>('.blocklyToolbox');
  const flyoutEl = host.querySelector<SVGElement>('.blocklyToolboxFlyout');
  const cancel = () => { if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; } };
  const leave = () => {
    inside = false; cancel();
    timer = window.setTimeout(() => { if (getAutoHide() && !inside) close(); }, HIDE_DELAY_MS);
  };
  // Where the pointer is is decided by position, not by enter/leave events, which are unreliable while the palette opens and closes.
  const hit = (el: Element | null, x: number, y: number) => { const r = el?.getBoundingClientRect(); return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const onMove = (e: PointerEvent) => {
    if (!getAutoHide()) { inside = false; return; }
    const overToolbox = hit(toolboxEl, e.clientX, e.clientY);
    const overPalette = flyout.isVisible() && hit(flyoutEl, e.clientX, e.clientY);
    if (!overToolbox && !overPalette) { if (inside) leave(); return; }
    inside = true; cancel();
    if (overToolbox) {
      const t = e.target as Node;
      const item = selectable().find((i) => i.getDiv()?.contains(t));
      if (item) open(item);
    }
  };
  document.addEventListener('pointermove', onMove, true);
  document.documentElement.addEventListener('mouseleave', leave);

  apply();
  return {
    apply,
    dispose: () => {
      cancel(); ws.removeChangeListener(onSelect);
      document.removeEventListener('pointermove', onMove, true);
      document.documentElement.removeEventListener('mouseleave', leave);
    },
  };
}

export function BlocklyEditor({ theme, autoHidePalette, onReady, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const paletteRef = useRef<ReturnType<typeof setupPalette> | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const autoRef = useRef(autoHidePalette);
  autoRef.current = autoHidePalette;
  useEffect(() => { wsRef.current?.setTheme(theme === 'light' ? lightTheme : darkTheme); }, [theme]);
  useEffect(() => { paletteRef.current?.apply(); }, [autoHidePalette]);
  useEffect(() => {
    registerBlocks();
    const ws = Blockly.inject(host.current!, {
      toolbox: TOOLBOX, theme: themeRef.current === 'light' ? lightTheme : darkTheme, renderer: 'zelos', sounds: false, trashcan: true,
      media: './blockly-media/', // bundled with the app: the packaged app has a strict policy that blocks loading icons from the internet
      grid: { spacing: 24, length: 2, colour: '#2b2540', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.3, maxScale: 2, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    const emit = () => onChange(Blockly.serialization.workspaces.save(ws) as WorkspaceState);
    let busy = false;
    ws.addChangeListener((e: Blockly.Events.Abstract) => {
      if (e.isUiEvent || busy) return;
      busy = true;
      try { ensureStart(ws); syncObjects(ws); } finally { busy = false; }
      emit();
    });
    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(host.current!);
    wsRef.current = ws;
    afterWorkspaceReplaced(ws);
    paletteRef.current = setupPalette(ws, host.current!, () => autoRef.current);
    const stopHover = setupHoverHighlight(ws, host.current!);
    onReady(ws);
    emit();
    return () => { stopHover(); paletteRef.current?.dispose(); ro.disconnect(); ws.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={host} className="blockly-host" />;
}
