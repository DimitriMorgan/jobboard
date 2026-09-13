import React from 'react';
import { CONTRACT_LABELS, REMOTE_LABELS, STATUS_LABELS, formatDate, formatTjm, formatAnnual } from '../api.js';

export default function JobCard({ job, meta, selected, onSelect, onUpdate }) {
  const source = meta?.sources?.find((s) => s.id === job.source);
  const tjm = formatTjm(job);
  const annual = formatAnnual(job);
  return (
    <article className={`job-card ${selected ? 'selected' : ''} ${job.isNew ? 'is-new' : ''} ${job.status === 'ignore' ? 'is-ignored' : ''}`} onClick={() => onSelect(job.id)}>
      <div className="job-card-main">
        <div className="job-title-row">
          {job.isNew ? <span className="pill new">Nouveau</span> : null}
          <h4>{job.title}</h4>
        </div>
        <div className="job-meta">
          <span className="company">{job.company}</span>
          {job.location ? <span>· {job.location}</span> : null}
          {job.remote ? <span>· {REMOTE_LABELS[job.remote]}</span> : null}
        </div>
        <div className="pay-row">
          {tjm ? <span className="pay tjm" title="Taux journalier (freelance)">TJM {tjm}</span> : null}
          {annual ? <span className="pay annual" title="Salaire annuel (CDI)">Salaire {annual}</span> : null}
          {!tjm && !annual ? <span className="pay unknown">{job.salary ? job.salary : 'Rémunération non précisée'}</span> : null}
        </div>
        <div className="badges">
          {job.contracts.map((c) => (
            <span key={c} className={`badge contract ${c}`}>
              {CONTRACT_LABELS[c] || c}
            </span>
          ))}
          {job.techs.map((t) => (
            <span key={t} className={`badge tech ${t}`}>
              {meta?.techs?.find((x) => x.id === t)?.label || t}
            </span>
          ))}
          <span className="badge source">{source?.name || job.source}</span>
          {!job.stillListed ? <span className="badge stale">Non revue depuis 7 j</span> : null}
        </div>
      </div>
      <div className="job-card-side" onClick={(e) => e.stopPropagation()}>
        <span className="date" title={job.publishedAt || ''}>
          {formatDate(job.publishedAt || job.firstSeenAt)}
        </span>
        <button className={`star ${job.favorite ? 'on' : ''}`} title="Favori" onClick={() => onUpdate(job.id, { favorite: !job.favorite })}>
          {job.favorite ? '★' : '☆'}
        </button>
        <select className={`status-select status-${job.status}`} value={job.status} onChange={(e) => onUpdate(job.id, { status: e.target.value })}>
          {Object.entries(STATUS_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <a className="ext" href={job.url} target="_blank" rel="noopener noreferrer" title="Ouvrir l'offre">
          Voir l'offre ↗
        </a>
      </div>
    </article>
  );
}
