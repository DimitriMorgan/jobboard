import React, { useEffect, useState } from 'react';
import { api, CONTRACT_LABELS, STATUS_LABELS, formatDate } from '../api.js';

const COLUMNS = ['a_postuler', 'candidature_envoyee', 'relance', 'entretien', 'offre_recue', 'refus'];

export default function TrackingBoard({ onSelect, selectedId, onUpdate }) {
  const [jobs, setJobs] = useState([]);

  const load = () => api.jobs({ statuses: COLUMNS, sort: 'status', sinceDays: 0, limit: 2000 }).then((r) => setJobs(r.jobs));
  useEffect(() => {
    load();
  }, []);

  async function move(id, status) {
    await onUpdate(id, { status });
    load();
  }

  return (
    <div className="board">
      {COLUMNS.map((col) => {
        const items = jobs.filter((j) => j.status === col);
        return (
          <section key={col} className={`column status-${col}`}>
            <h3>
              {STATUS_LABELS[col]} <span className="count">{items.length}</span>
            </h3>
            {items.map((j) => (
              <article key={j.id} className={`board-card ${j.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(j.id)}>
                <h4>{j.title}</h4>
                <p className="muted small">
                  {j.company}
                  {j.location ? ` · ${j.location}` : ''}
                </p>
                <p className="small">
                  {j.contracts.map((c) => CONTRACT_LABELS[c]).join(', ')} · mis à jour {formatDate(j.statusUpdatedAt)}
                </p>
                {j.notes ? <p className="note small">{j.notes.slice(0, 120)}</p> : null}
                <div className="board-actions" onClick={(e) => e.stopPropagation()}>
                  <select value={j.status} onChange={(e) => move(j.id, e.target.value)}>
                    {Object.entries(STATUS_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <a href={j.url} target="_blank" rel="noopener noreferrer">
                    ↗
                  </a>
                </div>
              </article>
            ))}
            {!items.length ? <p className="muted small">Aucune offre</p> : null}
          </section>
        );
      })}
    </div>
  );
}
