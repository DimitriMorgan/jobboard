import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import Filters, { DEFAULT_FILTERS } from './components/Filters.jsx';
import JobList from './components/JobList.jsx';
import JobDetail from './components/JobDetail.jsx';
import SourcesPanel from './components/SourcesPanel.jsx';
import TrackingBoard from './components/TrackingBoard.jsx';

const FILTERS_KEY = 'jobboard.filters.v1';

function loadFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null');
    return saved ? { ...DEFAULT_FILTERS, ...saved } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState(loadFilters);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('offres');
  const [refresh, setRefresh] = useState(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(e.message));
    api.refreshStatus().then((s) => {
      setRefresh(s);
      if (s.running) startPolling();
    });
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const [{ jobs }, stats] = await Promise.all([api.jobs(filters), api.stats()]);
      setJobs(jobs);
      setStats(stats);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(loadJobs, 150);
    return () => clearTimeout(t);
  }, [loadJobs]);

  useEffect(() => {
    if (!selectedId) return setSelected(null);
    api.job(selectedId).then(async (job) => {
      if (job.status === 'nouveau') {
        const updated = await api.updateJob(job.id, { status: 'vu' });
        job = { ...job, ...updated, duplicates: job.duplicates };
        setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: 'vu' } : j)));
      }
      setSelected(job);
    }).catch((e) => setError(e.message));
  }, [selectedId]);

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const s = await api.refreshStatus();
      setRefresh(s);
      if (!s.running) {
        clearInterval(pollRef.current);
        loadJobs();
      }
    }, 1500);
  }

  async function onRefresh(only) {
    try {
      const s = await api.refresh(only);
      setRefresh(s);
      startPolling();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onUpdate(id, patch) {
    const updated = await api.updateJob(id, patch);
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...updated } : j)));
    if (selected?.id === id) setSelected((s) => ({ ...s, ...updated }));
    api.stats().then(setStats);
    return updated;
  }

  const running = refresh?.running;
  const progress = useMemo(() => {
    if (!refresh?.sources) return null;
    const entries = Object.values(refresh.sources);
    const done = entries.filter((s) => s.status !== 'running' && s.status !== 'pending').length;
    return { done, total: entries.length };
  }, [refresh]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span>
          <div>
            <h1>JobBoard</h1>
            <p>Freelance & CDI · JavaScript · React · PHP · Node.js · .NET</p>
          </div>
        </div>
        <nav className="tabs">
          {[
            ['offres', 'Offres'],
            ['suivi', 'Mon suivi'],
            ['sources', 'Sources'],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
              {id === 'offres' && stats ? <span className="count">{stats.total}</span> : null}
              {id === 'suivi' && stats ? <span className="count">{Object.entries(stats.byStatus).filter(([k]) => !['nouveau', 'vu', 'ignore'].includes(k)).reduce((a, [, n]) => a + n, 0)}</span> : null}
            </button>
          ))}
        </nav>
        <div className="refresh-zone">
          {stats?.latestRun ? (
            <span className="muted small">
              Dernière actualisation : {new Date(stats.latestRun.finished_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · {stats.newCount} nouvelle{stats.newCount > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="muted small">Aucune actualisation pour l'instant</span>
          )}
          <button className="primary refresh-btn" disabled={running} onClick={() => onRefresh()}>
            {running ? (
              <>
                <span className="spinner" /> Actualisation… {progress ? `${progress.done}/${progress.total}` : ''}
              </>
            ) : (
              <>⟳ Actualiser</>
            )}
          </button>
        </div>
      </header>

      {error ? (
        <div className="banner error">
          {error} <button onClick={() => setError('')}>×</button>
        </div>
      ) : null}
      {running && refresh?.sources ? (
        <div className="banner progress">
          {Object.entries(refresh.sources)
            .filter(([, s]) => s.status === 'running')
            .map(([id, s]) => (
              <span key={id}>
                <strong>{meta?.sources.find((x) => x.id === id)?.name || id}</strong> : {s.message}
              </span>
            ))}
        </div>
      ) : null}

      {tab === 'sources' ? (
        <SourcesPanel meta={meta} refreshState={refresh} onRefresh={onRefresh} filters={filters} />
      ) : tab === 'suivi' ? (
        <TrackingBoard onSelect={setSelectedId} selectedId={selectedId} onUpdate={onUpdate} />
      ) : (
        <div className="layout">
          <Filters meta={meta} stats={stats} filters={filters} onChange={setFilters} />
          <main className="content">
            <div className="list-header">
              <span>
                {loading ? 'Chargement…' : `${jobs.length} offre${jobs.length > 1 ? 's' : ''}`}
                {stats?.newCount ? <span className="pill new"> {stats.newCount} nouvelle{stats.newCount > 1 ? 's' : ''} depuis la dernière actualisation</span> : null}
              </span>
              <label className="sort">
                Tri
                <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
                  <option value="published">Date de publication</option>
                  <option value="seen">Date de découverte</option>
                  <option value="status">Dernier changement de statut</option>
                  <option value="tjm">TJM décroissant</option>
                  <option value="salary">Salaire décroissant</option>
                </select>
              </label>
            </div>
            <JobList jobs={jobs} meta={meta} selectedId={selectedId} onSelect={setSelectedId} onUpdate={onUpdate} />
          </main>
        </div>
      )}

      {selected ? <JobDetail job={selected} meta={meta} onClose={() => setSelectedId(null)} onUpdate={onUpdate} /> : null}
    </div>
  );
}
