import React, { useEffect, useMemo, useState } from 'react';
import { api, formatDateTime } from '../api.js';

const ATS_LABELS = { lever: 'Lever', 'lever-eu': 'Lever', greenhouse: 'Greenhouse', ashby: 'Ashby', recruitee: 'Recruitee', workable: 'Workable', smartrecruiters: 'SmartRecruiters', personio: 'Personio' };
const PAGE = 200;

/** Onglet Entreprises : annuaire des entreprises suivies sur leur site carrière, et ajout d'une page carrière. */
export default function CompaniesPanel({ refreshState, onAdd, onShowJobs }) {
  const [companies, setCompanies] = useState(null);
  const [q, setQ] = useState('');
  const [onlyHiring, setOnlyHiring] = useState(true);
  const [visible, setVisible] = useState(PAGE);
  const [urls, setUrls] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api.companies().then(setCompanies).catch(() => setCompanies([]));
  }, [refreshState?.finishedAt]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (companies || []).filter((c) => (!onlyHiring || c.devJobs > 0) && (!needle || c.name.toLowerCase().includes(needle)));
  }, [companies, q, onlyHiring]);
  const hiring = (companies || []).filter((c) => c.devJobs > 0).length;

  async function submit(e) {
    e.preventDefault();
    const list = urls.split(/\s+/).filter((u) => /^https?:\/\//.test(u));
    if (!list.length) return;
    const ok = await onAdd(list);
    if (ok) {
      setSent(true);
      setUrls('');
    }
  }

  return (
    <div className="sources-page">
      <section>
        <h2>Entreprises suivies sur leur site carrière</h2>
        <p className="muted">
          Chaque jour, le board relit les offres publiées par ces entreprises sur leur page carrière (Lever, Greenhouse, Ashby, Recruitee, Workable, SmartRecruiters, Personio)
          et ajoute leurs postes de développeur en France ou en télétravail. L'annuaire grandit tout seul : entreprises qui recrutent déjà des devs dans le board, liens trouvés
          dans les offres, et vos ajouts.
        </p>
        {companies == null ? (
          <p className="muted">Chargement…</p>
        ) : !companies.length ? (
          <p className="muted">L'annuaire se remplit lors des prochaines actualisations.</p>
        ) : (
          <>
            <div className="companies-bar">
              <strong>{companies.length}</strong> entreprises suivies, dont <strong>{hiring}</strong> avec des offres de développeur en ce moment.
              <input type="search" placeholder="Rechercher une entreprise…" value={q} onChange={(e) => { setQ(e.target.value); setVisible(PAGE); }} />
              <label className="small">
                <input type="checkbox" checked={onlyHiring} onChange={(e) => { setOnlyHiring(e.target.checked); setVisible(PAGE); }} /> Seulement celles qui recrutent des devs
              </label>
            </div>
            <table className="sources-table">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Plateforme</th>
                  <th>Offres de dev</th>
                  <th>Offres en France</th>
                  <th>Vérifiée le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, visible).map((c) => (
                  <tr key={`${c.ats}:${c.slug}`}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.manual ? <span className="badge also"> ajout manuel</span> : null}
                    </td>
                    <td>{ATS_LABELS[c.ats] || c.ats}</td>
                    <td>{c.devJobs ? <button className="link" onClick={() => onShowJobs(c.name)}>{c.devJobs} offre{c.devJobs > 1 ? 's' : ''} →</button> : <span className="muted">0</span>}</td>
                    <td>{c.frJobs}</td>
                    <td className="muted small">{formatDateTime(c.checkedAt)}</td>
                    <td>
                      {c.careersUrl ? (
                        <a href={c.careersUrl} target="_blank" rel="noopener noreferrer">
                          Page carrière ↗
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > visible ? (
              <button className="secondary-btn load-more" onClick={() => setVisible((v) => v + PAGE)}>
                Afficher {Math.min(PAGE, list.length - visible)} entreprises de plus ({list.length - visible} restantes)
              </button>
            ) : null}
          </>
        )}
      </section>
      <section>
        <h2>Suivre une entreprise</h2>
        <p className="muted">
          Collez l'adresse de sa page carrière : une page Lever, Greenhouse, Ashby, Recruitee, Workable, SmartRecruiters ou Personio, ou la page « carrières » de son propre site
          si elle renvoie vers l'une de ces plateformes. Plusieurs adresses possibles, une par ligne. L'entreprise reste suivie même sans offre en France.
        </p>
        <form className="companies-add" onSubmit={submit}>
          <textarea rows={3} value={urls} onChange={(e) => { setUrls(e.target.value); setSent(false); }} placeholder="https://jobs.lever.co/entreprise&#10;https://www.entreprise.fr/carrieres" />
          <button className="primary" type="submit" disabled={refreshState?.running || !urls.trim()}>
            Suivre
          </button>
        </form>
        {sent ? <p className="small muted">Ajout lancé : l'entreprise et ses offres apparaissent dans une à deux minutes.</p> : null}
      </section>
    </div>
  );
}
