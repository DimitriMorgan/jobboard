import React from 'react';
import { CONTRACT_LABELS, STATUS_LABELS } from '../api.js';

export const DEFAULT_FILTERS = {
  q: '',
  techs: [],
  contracts: ['freelance', 'cdi'],
  sources: [],
  statuses: [],
  country: 'FR_OR_REMOTE',
  remote: '',
  sinceDays: 30,
  onlyNew: false,
  favorite: false,
  hideStale: false,
  sort: 'published',
};

function Chip({ active, onClick, children, count }) {
  return (
    <button type="button" className={`chip ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
      {count != null ? <span className="chip-count">{count}</span> : null}
    </button>
  );
}

export default function Filters({ meta, stats, filters, onChange }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const toggle = (key, value) => set({ [key]: filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value] });

  return (
    <aside className="sidebar">
      <div className="filter-group">
        <input type="search" placeholder="Rechercher (titre, société, ville…)" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
      </div>

      <div className="filter-group">
        <h3>Technos</h3>
        <div className="chips">
          {(meta?.techs || []).map((t) => (
            <Chip key={t.id} active={filters.techs.includes(t.id)} onClick={() => toggle('techs', t.id)} count={stats?.byTech?.[t.id] || 0}>
              {t.label}
            </Chip>
          ))}
        </div>
        <p className="hint">Aucune sélection = toutes les technos.</p>
      </div>

      <div className="filter-group">
        <h3>Contrat</h3>
        <div className="chips">
          {['freelance', 'cdi', 'cdd', 'interim', 'alternance', 'stage', 'autre'].map((c) => (
            <Chip key={c} active={filters.contracts.includes(c)} onClick={() => toggle('contracts', c)} count={stats?.byContract?.[c] || 0}>
              {CONTRACT_LABELS[c]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h3>Lieu</h3>
        <select value={filters.country} onChange={(e) => set({ country: e.target.value })}>
          <option value="FR_OR_REMOTE">France ou full remote</option>
          <option value="FR">France uniquement</option>
          <option value="REMOTE">Full remote uniquement</option>
          <option value="">Tout (monde entier)</option>
        </select>
        <select value={filters.remote} onChange={(e) => set({ remote: e.target.value })}>
          <option value="">Télétravail : indifférent</option>
          <option value="any">Télétravail possible (partiel ou total)</option>
          <option value="full">Full remote uniquement</option>
        </select>
      </div>

      <div className="filter-group">
        <h3>Période</h3>
        <select value={filters.sinceDays} onChange={(e) => set({ sinceDays: Number(e.target.value) })}>
          <option value={1}>Dernières 24 h</option>
          <option value={3}>3 derniers jours</option>
          <option value={7}>7 derniers jours</option>
          <option value={30}>30 derniers jours</option>
          <option value={0}>Toutes</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={filters.onlyNew} onChange={(e) => set({ onlyNew: e.target.checked })} /> Nouvelles depuis la dernière actualisation
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.favorite} onChange={(e) => set({ favorite: e.target.checked })} /> Favoris uniquement
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.hideStale} onChange={(e) => set({ hideStale: e.target.checked })} /> Masquer les offres disparues (non revues depuis 7 j)
        </label>
      </div>

      <div className="filter-group">
        <h3>Statut de suivi</h3>
        <div className="chips">
          {Object.entries(STATUS_LABELS).map(([id, label]) => (
            <Chip key={id} active={filters.statuses.includes(id)} onClick={() => toggle('statuses', id)} count={stats?.byStatus?.[id] || 0}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h3>Sources</h3>
        <div className="chips">
          {(meta?.sources || []).map((s) => (
            <Chip key={s.id} active={filters.sources.includes(s.id)} onClick={() => toggle('sources', s.id)}>
              {s.name}
            </Chip>
          ))}
        </div>
      </div>

      <button type="button" className="link" onClick={() => onChange(DEFAULT_FILTERS)}>
        Réinitialiser les filtres
      </button>
    </aside>
  );
}
