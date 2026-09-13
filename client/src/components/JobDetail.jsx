import React, { useEffect, useState } from 'react';
import { CONTRACT_LABELS, REMOTE_LABELS, STATUS_LABELS, formatDateTime } from '../api.js';

export default function JobDetail({ job, meta, onClose, onUpdate }) {
  const [notes, setNotes] = useState(job.notes || '');
  const [saved, setSaved] = useState(true);
  const source = meta?.sources?.find((s) => s.id === job.source);

  useEffect(() => {
    setNotes(job.notes || '');
    setSaved(true);
  }, [job.id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function saveNotes() {
    if (notes === (job.notes || '')) return;
    await onUpdate(job.id, { notes });
    setSaved(true);
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-header">
          <div>
            <h2>{job.title}</h2>
            <p className="muted">
              {job.company}
              {job.location ? ` · ${job.location}` : ''}
              {job.remote ? ` · ${REMOTE_LABELS[job.remote]}` : ''}
            </p>
          </div>
          <button className="icon" onClick={onClose} title="Fermer (Échap)">
            ×
          </button>
        </header>

        <div className="drawer-actions">
          <a className="primary" href={job.url} target="_blank" rel="noopener noreferrer">
            Voir l'offre sur {source?.name || job.source} ↗
          </a>
          {job.applyUrl && job.applyUrl !== job.url ? (
            <a className="secondary" href={job.applyUrl} target="_blank" rel="noopener noreferrer">
              Postuler ↗
            </a>
          ) : null}
          <button className={`star big ${job.favorite ? 'on' : ''}`} onClick={() => onUpdate(job.id, { favorite: !job.favorite })}>
            {job.favorite ? '★ Favori' : '☆ Favori'}
          </button>
        </div>

        <section className="drawer-tracking">
          <label>
            Statut de suivi
            <select className={`status-select status-${job.status}`} value={job.status} onChange={(e) => onUpdate(job.id, { status: e.target.value })}>
              {Object.entries(STATUS_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes personnelles {saved ? <span className="muted small">(enregistré)</span> : <span className="small warn">(non enregistré — cliquez ailleurs pour sauvegarder)</span>}
            <textarea
              rows={4}
              placeholder="Contact, date de candidature, TJM proposé, retour reçu…"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setSaved(false);
              }}
              onBlur={saveNotes}
            />
          </label>
        </section>

        <dl className="meta-grid">
          <dt>Contrat</dt>
          <dd>{job.contracts.map((c) => CONTRACT_LABELS[c] || c).join(', ')}</dd>
          <dt>Technos</dt>
          <dd>{job.techs.map((t) => meta?.techs?.find((x) => x.id === t)?.label || t).join(', ')}</dd>
          {job.salary ? (
            <>
              <dt>Rémunération</dt>
              <dd>{job.salary}</dd>
            </>
          ) : null}
          <dt>Publiée</dt>
          <dd>{formatDateTime(job.publishedAt)}</dd>
          <dt>Découverte</dt>
          <dd>{formatDateTime(job.firstSeenAt)}</dd>
          <dt>Vue pour la dernière fois</dt>
          <dd>
            {formatDateTime(job.lastSeenAt)} {!job.stillListed ? <span className="badge stale">peut-être retirée</span> : null}
          </dd>
          <dt>Source</dt>
          <dd>{source?.name || job.source}</dd>
          {job.duplicates?.length ? (
            <>
              <dt>Aussi publiée sur</dt>
              <dd>
                {job.duplicates.map((d) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="dup">
                    {meta?.sources?.find((s) => s.id === d.source)?.name || d.source} ↗
                  </a>
                ))}
              </dd>
            </>
          ) : null}
        </dl>

        {job.tags?.length ? (
          <div className="tags">
            {job.tags.map((t, i) => (
              <span key={i} className="tag">
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <section className="description">
          <h3>Description</h3>
          {job.description ? (
            <div className="description-body" dangerouslySetInnerHTML={{ __html: job.description }} />
          ) : (
            <p className="muted">Description non récupérée pour cette source. Ouvrez l'offre pour le détail complet.</p>
          )}
        </section>
      </aside>
    </>
  );
}
