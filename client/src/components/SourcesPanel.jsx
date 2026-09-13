import React, { useEffect, useState } from 'react';
import { api, IS_STATIC, CONTRACT_LABELS, formatDateTime } from '../api.js';
import Settings from './Settings.jsx';

const STATUS_ICON = { ok: '✅', partial: '⚠️', error: '❌', skipped: '⏸', running: '⏳', pending: '…' };

export default function SourcesPanel({ meta, refreshState, onRefresh, filters }) {
  const [sources, setSources] = useState([]);
  const [tech, setTech] = useState(filters.techs[0] || 'react');
  const [contract, setContract] = useState('');
  const [links, setLinks] = useState([]);

  useEffect(() => {
    api.sources().then(setSources);
  }, [refreshState?.running, refreshState?.finishedAt]);

  useEffect(() => {
    api.manualLinks(tech, contract).then(setLinks);
  }, [tech, contract]);

  return (
    <div className="sources-page">
      {IS_STATIC ? <Settings /> : null}
      <section>
        <h2>Sources automatiques</h2>
        <p className="muted">
          Chaque source est interrogée indépendamment lors d'une actualisation. Une source en erreur n'empêche pas les autres. Les sources marquées « identifiants manquants »
          s'activent en renseignant les clés {IS_STATIC ? <>dans les <em>secrets</em> du dépôt GitHub (Settings → Secrets and variables → Actions)</> : <>dans le fichier <code>.env</code> (voir <code>.env.example</code>)</>}.
        </p>
        <table className="sources-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>État</th>
              <th>Offres en base</th>
              <th>Dernière exécution</th>
              <th>Dernier résultat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const live = s.live;
              const status = live?.status || (!s.enabled ? 'skipped' : s.lastStatus || 'pending');
              return (
                <tr key={s.id} className={!s.enabled ? 'disabled' : ''}>
                  <td>
                    <a href={s.site} target="_blank" rel="noopener noreferrer">
                      <strong>{s.name}</strong>
                    </a>
                    <div className="muted small">{s.description}</div>
                  </td>
                  <td>
                    {STATUS_ICON[status] || ''} {status}
                    {!s.enabled ? <div className="small warn">{s.reason}</div> : null}
                  </td>
                  <td>{s.total}</td>
                  <td>{formatDateTime(live?.status === 'running' ? refreshState.startedAt : s.lastRunAt)}</td>
                  <td>
                    {live?.message || (s.lastRunAt ? `${s.lastCount} offres (${s.lastNew} nouvelles), ${(s.durationMs / 1000).toFixed(1)} s` : '—')}
                    {(live?.error || live?.warning || (!live && s.lastError)) ? <div className="small warn">{live?.error || live?.warning || s.lastError}</div> : null}
                  </td>
                  <td>
                    {!IS_STATIC ? (
                      <button disabled={!s.enabled || refreshState?.running} onClick={() => onRefresh([s.id])}>
                        Actualiser
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Recherches manuelles (plateformes sans API exploitable)</h2>
        <p className="muted">Indeed, Malt, Comet, Glassdoor… bloquent les robots ou exigent une connexion. Ces liens ouvrent directement la recherche pré-remplie.</p>
        <div className="manual-controls">
          <select value={tech} onChange={(e) => setTech(e.target.value)}>
            {(meta?.techs || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={contract} onChange={(e) => setContract(e.target.value)}>
            <option value="">Tous contrats</option>
            <option value="freelance">{CONTRACT_LABELS.freelance}</option>
            <option value="cdi">{CONTRACT_LABELS.cdi}</option>
          </select>
        </div>
        <div className="manual-links">
          {links.map((l) => (
            <a key={l.id} className="manual-link" href={l.url} target="_blank" rel="noopener noreferrer">
              {l.name} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
