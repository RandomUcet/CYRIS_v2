import { useEffect, useRef, useState } from 'react';
import { ClipboardCopy, ClipboardList, Sparkles } from 'lucide-react';
import type { SupportAssistInput } from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';
import styles from './support.module.css';

type State =
  | { kind: 'idle' | 'busy' }
  | { kind: 'error'; status?: number }
  | { kind: 'ready'; text: string };

interface Props {
  eventId: string;
  input: SupportAssistInput;
  applyReply?: (suggestion: string) => void;
  hasDraft?: boolean;
}

// Callers key this component by the input context, including the draft edit and ticket revision.
export function SupportAssist({ eventId, input, applyReply, hasDraft }: Props) {
  const cs = input.locale === 'cs';
  const isReply = input.action === 'REPLY';
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [copyStatus, setCopyStatus] = useState('');
  const handover = useRef<HTMLTextAreaElement>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);

  async function generate() {
    if (state.kind === 'busy') return;
    const request = ++sequence.current;
    setCopyStatus('');
    setState({ kind: 'busy' });
    try {
      const response = await apiClient.assistSupport(eventId, input);
      if (request !== sequence.current) return;
      const text = response.data?.text.trim();
      setState(response.ok && text ? { kind: 'ready', text } : { kind: 'error', status: response.status });
    } catch {
      if (request === sequence.current) setState({ kind: 'error' });
    }
  }

  async function copyHandover() {
    if (!handover.current) return;
    try {
      await navigator.clipboard.writeText(handover.current.value);
      setCopyStatus(cs ? 'Text byl zkopírován.' : 'Text copied.');
    } catch {
      handover.current?.focus();
      handover.current?.select();
      setCopyStatus(cs ? 'Text je vybraný. Zkopírujte ho do schránky.' : 'Text selected. Use your copy command.');
    }
  }

  const action = isReply
    ? (cs ? 'Navrhnout odpověď' : 'Suggest a reply')
    : (cs ? 'Připravit předání směny' : 'Prepare shift handover');
  const Icon = isReply ? Sparkles : ClipboardList;
  return (
    <div className={styles.assistance}>
      <button type="button" onClick={() => void generate()} disabled={state.kind === 'busy'}>
        <Icon size={16} aria-hidden="true" />{action}
      </button>
      {state.kind === 'busy' && <span role="status">{cs ? 'Připravuji návrh…' : 'Preparing a draft…'}</span>}
      {state.kind === 'error' && (
        <p role="alert" className={styles.feedback}>
          {state.status === 429 ? (cs ? 'AI je vytížená. Můžete pokračovat ručně nebo návrh za chvíli zkusit znovu.' : 'AI is busy. Continue manually or try again shortly.')
            : state.status === 409 ? (cs ? 'Obnovte žádost nebo frontu a otevřete návrh znovu.' : 'Refresh the request or queue and open the draft again.')
            : isReply
            ? (cs ? 'Návrh není k dispozici. Odpověď můžete napsat ručně nebo obnovit žádost a zkusit to znovu.' : 'The suggestion is unavailable. You can write a reply or refresh the request and try again.')
            : (cs ? 'Předání se nepodařilo připravit. Obnovte frontu a zkuste to znovu.' : 'The handover is unavailable. Refresh the queue and try again.')}
        </p>
      )}
      {state.kind === 'ready' && (
        <section className={styles.suggestion} aria-label={isReply ? (cs ? 'Návrh odpovědi' : 'Suggested reply') : (cs ? 'Předání směny' : 'Shift handover')}>
          {isReply ? (
            <>
              <h3>{cs ? 'Návrh odpovědi' : 'Suggested reply'}</h3>
              <p className={styles.suggestionText}>{state.text}</p>
            </>
          ) : (
            <label>
              {cs ? 'Podklad pro předání směny' : 'Shift handover notes'}
              <textarea ref={handover} readOnly rows={5} value={state.text} />
            </label>
          )}
          <div className={styles.actions}>
            {isReply ? (
              <button type="button" onClick={() => applyReply?.(state.text)}>
                {hasDraft ? (cs ? 'Připojit k rozepsané odpovědi' : 'Append to my reply') : (cs ? 'Vložit do odpovědi' : 'Use in reply')}
              </button>
            ) : (
              <button type="button" onClick={() => void copyHandover()}><ClipboardCopy size={15} aria-hidden="true" />{cs ? 'Kopírovat' : 'Copy'}</button>
            )}
            <button type="button" className="btn-ghost" onClick={() => setState({ kind: 'idle' })}>{cs ? 'Zavřít návrh' : 'Dismiss draft'}</button>
            {copyStatus && <span role="status">{copyStatus}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
