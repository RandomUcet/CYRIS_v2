'use client';

import { useEffect, useState } from 'react';
import type { ScenarioDraftRecordList, ScenarioDataBatchResponse, ScenarioDraftMediaItem } from '@cyris/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';
import styles from './ScenarioBatchMediaManager.module.css';

type Kind = ScenarioDraftRecordList['kind'];
const kinds: Kind[] = ['persons', 'organisations', 'locations', 'vehicles', 'devices', 'weapons'];
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const maxBytes = 5 * 1024 * 1024;
const labels: Record<Kind, [string, string]> = {
  persons: ['Osoby', 'People'], organisations: ['Organizace', 'Organisations'],
  locations: ['Místa', 'Locations'], vehicles: ['Vozidla', 'Vehicles'],
  devices: ['Technika', 'Devices'], weapons: ['Rekvizity', 'Props'],
};
function encodeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Cannot read image file'));
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== 'string' || !data.startsWith('data:') || !data.includes(',')) {
        reject(new Error('Invalid image')); return;
      }
      resolve(data.slice(data.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function ScenarioDraftMediaManager({ eventId, batch }: {
  eventId: string; batch: ScenarioDataBatchResponse;
}) {
  const { hasPermission, isPlatformAdmin, viewAs } = useAuth();
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const tr = (cz: string, en: string) => cs ? cz : en;
  const canEdit = !viewAs && (isPlatformAdmin ||
    (hasPermission('scenario.manage', eventId) && hasPermission('registry.update', eventId)));
  const [kind, setKind] = useState<Kind>('persons');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ScenarioDraftRecordList | null>(null);
  const [media, setMedia] = useState<ScenarioDraftMediaItem[]>([]);
  const [revision, setRevision] = useState(0);
  const [imageVersion, setImageVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { setPage(1); }, [eventId, batch.id, kind]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      apiClient.getScenarioDraftRecords(eventId, batch.id, kind, page),
      apiClient.getScenarioDraftMedia(eventId, batch.id),
    ]).then(([records, images]) => {
      if (!active) return;
      if (!records.ok) throw new Error(records.error || 'Unable to load draft records');
      if (!images.ok) throw new Error(images.error || 'Unable to load draft images');
      setData(records.data ?? null);
      setMedia(images.data ?? []);
      setError('');
    }).catch(reason => {
      if (active) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load draft'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, batch.id, batch.prepared, kind, page, revision]);

  async function upload(index: number, file: File) {
    if (!canEdit || busy) return;
    setNotice(''); setError('');
    if (!allowed.has(file.type) || !file.size || file.size > maxBytes) {
      setError(tr('Povoleny jsou obrázky JPEG, PNG, WebP nebo GIF do 5 MB.',
        'Only JPEG, PNG, WebP or GIF images up to 5 MB are supported.')); return;
    }
    setBusy(true);
    try {
      const result = await apiClient.uploadScenarioDraftMedia(eventId, batch.id, {
        kind, index, filename: file.name, mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        data: await encodeImage(file),
      });
      if (!result.ok) throw new Error(result.error || 'Image upload failed');
      setNotice(tr('Fotografie je bezpečně uložená v konceptu. Při publikaci se automaticky přiřadí záznamu.',
        'Image saved with the draft. It will be linked to the correct registry record on publication.'));
      setRevision(v => v + 1); setImageVersion(v => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed');
    } finally { setBusy(false); }
  }

  async function remove(index: number) {
    if (!canEdit || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.removeScenarioDraftMedia(eventId, batch.id, kind, index);
      if (!result.ok) throw new Error(result.error || 'Image removal failed');
      setRevision(v => v + 1);
      setNotice(tr('Fotografie byla z konceptu odstraněna.', 'Image removed from draft.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image removal failed');
    } finally { setBusy(false); }
  }

  const byIndex = new Map(media.filter(x => x.kind === kind).map(row => [row.index, row]));
  return <section className={styles.manager} aria-label={tr('Fotografie ve Spark konceptu', 'Spark draft images')}>
    <header className={styles.header}>
      <div>
        <h3>{tr('Obrázky před publikací', 'Images before publication')}</h3>
        <p>{tr('Vyberte vygenerovaný záznam a připojte k němu obrázek. Soubor se uloží soukromě do úložiště CYRIS, neodesílá se Sparku. Po zveřejnění zůstane u stejné osoby, firmy nebo techniky.',
          'Choose a generated record and attach an image. Files are stored privately in CYRIS, never sent to Spark. They remain with the matching person, organisation or asset after publishing.')}</p>
      </div>
      <button type="button" onClick={() => setRevision(v => v + 1)} disabled={loading || busy}>
        {tr('Obnovit', 'Refresh')}</button>
    </header>
    <p className={styles.notice} role="status">
      {tr('Přiřazeno', 'Attached')}: {media.length} / 50 · {tr('Max. 5 MB na obrázek. Lze pokračovat i po opětovném otevření konceptu.',
        'Max 5 MB per image. Attachments survive reopening the draft.')}
    </p>
    {!canEdit && <p role="status" className={styles.notice}>{tr('Pro úpravy jsou potřeba práva spravovat scénář a registr.',
      'Scenario management and registry update permissions are required.')}</p>}
    <label className={styles.selector}>{tr('Typ záznamu', 'Record type')}
      <select value={kind} onChange={e => setKind(e.target.value as Kind)} disabled={busy}>
        {kinds.map(value => <option key={value} value={value}>{labels[value][cs ? 0 : 1]}</option>)}
      </select>
    </label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading ? <p>{tr('Načítám...', 'Loading...')}</p> : data?.records.length ? <>
      <div className={styles.records}>{data.records.map(record => {
        const existing = byIndex.get(record.index);
        return <article className={styles.record} key={record.index}>
          <div className={styles.thumbnail}>
            {existing ? <img alt={record.label} loading="lazy" src={
              apiClient.getScenarioDraftImageUrl(eventId, batch.id, kind, record.index) + '&v=' + imageVersion
            } /> : <span aria-hidden="true">▧</span>}
          </div>
          <div className={styles.recordText}>
            <strong>{record.label}</strong>
            <small>{tr('Záznam', 'Record')} #{record.index + 1}</small>
            {existing && <small>{existing.filename} · {Math.ceil(existing.byteSize / 1024)} kB</small>}
          </div>
          <div className={styles.actions}>
            <span>{existing ? tr('Připojeno', 'Attached') : tr('Bez obrázku', 'No image')}</span>
            {canEdit && <label className={styles.fileButton}>
              {busy ? '…' : existing ? tr('Nahradit', 'Replace') : tr('Vybrat obrázek', 'Choose image')}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={busy || loading} onChange={e => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (file) void upload(record.index, file);
                }} />
            </label>}
            {canEdit && existing && <button type="button" disabled={busy}
              onClick={() => void remove(record.index)}>{tr('Odebrat', 'Remove')}</button>}
          </div>
        </article>;
      })}</div>
      <nav className={styles.pagination} aria-label={tr('Stránkování', 'Pagination')}>
        <button type="button" disabled={page <= 1 || busy} onClick={() => setPage(x => Math.max(1, x - 1))}>
          {tr('Předchozí', 'Previous')}</button>
        <span>{tr('Strana', 'Page')} {page}</span>
        <button type="button" disabled={!data.hasMore || busy} onClick={() => setPage(x => x + 1)}>
          {tr('Další', 'Next')}</button>
      </nav>
    </> : <p>{tr('Pro tento typ nejsou v konceptu připravené záznamy.',
      'No prepared records of this type in the draft yet.')}</p>}
  </section>;
}
