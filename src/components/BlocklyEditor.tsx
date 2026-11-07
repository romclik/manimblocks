import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import { registerBlocks } from '../blocks/definitions';
import { TOOLBOX } from '../blocks/toolbox';
import type { WorkspaceState } from '../codegen/generate';

const theme = Blockly.Theme.defineTheme('manimDark', {
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

interface Props {
  onReady: (ws: Blockly.WorkspaceSvg) => void;
  onChange: (state: WorkspaceState) => void;
}

export function BlocklyEditor({ onReady, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    registerBlocks();
    const ws = Blockly.inject(host.current!, {
      toolbox: TOOLBOX, theme, renderer: 'zelos', sounds: false, trashcan: true,
      grid: { spacing: 24, length: 2, colour: '#2b2540', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.3, maxScale: 2, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    const emit = () => onChange(Blockly.serialization.workspaces.save(ws) as WorkspaceState);
    ws.addChangeListener((e: Blockly.Events.Abstract) => { if (!e.isUiEvent) emit(); });
    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(host.current!);
    onReady(ws);
    emit();
    return () => { ro.disconnect(); ws.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={host} className="blockly-host" />;
}
