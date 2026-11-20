import { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { supportFaq, type SupportAssistInput } from '@cyris/contracts';
import styles from './support.module.css';

function searchable(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

interface Props {
  locale: SupportAssistInput['locale'];
  onContact?: () => void;
}

export function SupportFaq({ locale, onContact }: Props) {
  const cs = locale === 'cs';
  const [query, setQuery] = useState('');
  const words = searchable(query).trim().split(/\s+/).filter(Boolean);
  const matches = supportFaq.filter(entry => {
    const { question, answer } = entry[locale];
    const content = searchable(question + ' ' + answer);
    return words.every(word => content.includes(word));
  });

  return (
    <section className={styles.faq} aria-labelledby="support-faq-heading">
      <h2 id="support-faq-heading"><BookOpen size={20} aria-hidden="true" />{cs ? 'Časté dotazy' : 'Frequently asked questions'}</h2>
      <label className={styles.search}>
        <span>{cs ? 'Hledat v otázkách a odpovědích' : 'Search questions and answers'}</span>
        <span className={styles.searchField}>
          <Search size={17} aria-hidden="true" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} />
        </span>
      </label>
      {matches.length === 0 ? (
        <div className={styles.noResults}>
          <p role="status">{cs ? 'K tomuto hledání jsme nenašli žádnou odpověď.' : 'No answers match your search.'}</p>
          {onContact && <button type="button" onClick={onContact}>{cs ? 'Napsat podpoře' : 'Contact support'}</button>}
        </div>
      ) : matches.map(entry => (
        <details key={entry.id} className={styles.question}>
          <summary>{entry[locale].question}</summary>
          <p>{entry[locale].answer}</p>
        </details>
      ))}
    </section>
  );
}
