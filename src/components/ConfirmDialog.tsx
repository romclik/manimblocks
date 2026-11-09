export interface DialogSpec { title: string; message: string; buttons: { label: string; value: string; primary?: boolean }[] }
export function ConfirmDialog({ spec, onChoose }: { spec: DialogSpec; onChoose: (value: string) => void }) {
  return (
    <div className="modal">
      <div className="dialog narrow" role="dialog" aria-modal="true">
        <h2>{spec.title}</h2>
        <p className="pre">{spec.message}</p>
        <div className="actions">
          {spec.buttons.map((b) => <button key={b.value} className={b.primary ? 'primary' : ''} onClick={() => onChoose(b.value)} autoFocus={b.primary}>{b.label}</button>)}
        </div>
      </div>
    </div>
  );
}
