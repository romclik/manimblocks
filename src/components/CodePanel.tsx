import { useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import type { GenerateResult } from '../codegen/generate';

export type Tab = 'code' | 'problems' | 'log';
interface Props { result: GenerateResult; onSelectBlock: (id: string) => void; tab: Tab; onTab: (t: Tab) => void; log: string[]; renderError: string }

export function CodePanel({ result, onSelectBlock, tab, onTab: setTab, log, renderError }: Props) {
  const html = useMemo(() => Prism.highlight(result.code, Prism.languages.python, 'python'), [result.code]);
  const lineCount = result.code.split('\n').length - 1;
  const total = result.problems.length;
  return (
    <section className="bottom">
      <div className="tabs">
        <button className={tab === 'code' ? 'on' : ''} onClick={() => setTab('code')}>Python code</button>
        <button className={tab === 'problems' ? 'on' : ''} onClick={() => setTab('problems')}>
          Problems {total > 0 && <span className={'badge ' + (result.errorCount ? 'err' : 'warn')}>{total}</span>}
        </button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Render log {renderError && <span className="badge err">!</span>}</button>
        <span className="hint">Read-only: edit your animation with blocks.</span>
      </div>
      {tab === 'log' ? (
        <div className="logpane">
          {renderError && <div className="renderr">{renderError}</div>}
          <pre>{log.length ? log.join('\n') : 'Nothing rendered yet. Click Render.'}</pre>
        </div>
      ) : tab === 'code' ? (
        <div className="code">
          <pre className="gutter" aria-hidden>{Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}</pre>
          <pre><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
        </div>
      ) : (
        <ul className="problems">
          {total === 0 && <li className="ok">No problems found.</li>}
          {result.problems.map((p, i) => (
            <li key={i} className={p.severity} onClick={() => p.blockId && onSelectBlock(p.blockId)}>
              <b>{p.severity === 'error' ? 'Error' : 'Warning'}</b> {p.message}
              {p.blockId && <span className="go">show block</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
