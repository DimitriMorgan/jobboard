import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../settings.js';
import { whoAmI } from '../github.js';
import { tracking, syncState } from '../tracking.js';

export default function Settings() {
  const [cfg, setCfg] = useState(getSettings);
  const [msg, setMsg] = useState('');
  const [sync, setSync] = useState({ ...syncState });
  const [importText, setImportText] = useState('');

  useEffect(() => {
    const t = setInterval(() => setSync({ ...syncState }), 1000);
    return () => clearInterval(t);
  }, []);

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  function save() {
    saveSettings(cfg);
    setMsg('Paramètres enregistrés (dans ce navigateur uniquement).');
    tracking.pull();
  }
  async function test() {
    saveSettings(cfg);
    try {
      const me = await whoAmI(cfg);
      setMsg(`Connecté à GitHub en tant que ${me.login}.`);
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <section className="settings">
      <h2>Paramètres GitHub</h2>
      <p className="muted">
        Le site est statique : les offres sont actualisées par un workflow GitHub Actions (chaque matin, ou à la demande). Pour déclencher l'actualisation depuis ce
        bouton et synchroniser votre suivi entre appareils, renseignez un <strong>jeton personnel à granularité fine</strong> (GitHub → Settings → Developer settings →
        Fine-grained tokens) avec, sur ce dépôt, les permissions <em>Actions : Read and write</em> et <em>Contents : Read and write</em> (Contents sur le dépôt de suivi si
        différent). Le jeton reste dans ce navigateur et n'est jamais envoyé ailleurs qu'à api.github.com.
      </p>
      <div className="settings-grid">
        <label>
          Jeton personnel GitHub
          <input type="password" value={cfg.token} onChange={(e) => set({ token: e.target.value.trim() })} placeholder="github_pat_…" autoComplete="off" />
        </label>
        <label>
          Dépôt du site (owner/nom)
          <input value={cfg.repo} onChange={(e) => set({ repo: e.target.value.trim() })} placeholder="utilisateur/jobboard" />
        </label>
        <label>
          Branche du workflow
          <input value={cfg.branch} onChange={(e) => set({ branch: e.target.value.trim() })} placeholder="main" />
        </label>
        <label>
          Dépôt de synchronisation du suivi (optionnel, dépôt privé conseillé)
          <input value={cfg.syncRepo} onChange={(e) => set({ syncRepo: e.target.value.trim() })} placeholder="utilisateur/jobboard-suivi" />
        </label>
        <label>
          Fichier de suivi
          <input value={cfg.syncPath} onChange={(e) => set({ syncPath: e.target.value.trim() || 'tracking.json' })} />
        </label>
        <label>
          Branche du fichier de suivi (vide = branche par défaut)
          <input value={cfg.syncBranch} onChange={(e) => set({ syncBranch: e.target.value.trim() })} placeholder="" />
        </label>
      </div>
      <div className="settings-actions">
        <button className="primary" onClick={save}>
          Enregistrer
        </button>
        <button onClick={test} disabled={!cfg.token}>
          Tester la connexion
        </button>
        <button onClick={() => tracking.pull().then(() => setMsg(syncState.error ? syncState.error : 'Suivi synchronisé.'))} disabled={!cfg.token || !cfg.syncRepo}>
          Synchroniser le suivi maintenant
        </button>
        <span className="muted small">
          {sync.configured ? (sync.syncing ? 'Synchronisation…' : sync.error ? `Erreur : ${sync.error}` : sync.lastSyncAt ? `Dernière synchro : ${new Date(sync.lastSyncAt).toLocaleTimeString('fr-FR')}` : 'Synchronisation configurée') : 'Suivi stocké dans ce navigateur uniquement'}
        </span>
      </div>
      {msg ? <p className="settings-msg">{msg}</p> : null}

      <details className="settings-backup">
        <summary>Sauvegarde manuelle du suivi (export / import JSON)</summary>
        <textarea rows={4} readOnly value={tracking.exportJson()} onFocus={(e) => e.target.select()} />
        <div className="settings-actions">
          <textarea rows={2} placeholder="Collez ici un export JSON pour l'importer (fusion)…" value={importText} onChange={(e) => setImportText(e.target.value)} />
          <button
            onClick={() => {
              try {
                tracking.importJson(importText);
                setImportText('');
                setMsg('Suivi importé.');
              } catch (e) {
                setMsg(`Import impossible : ${e.message}`);
              }
            }}
            disabled={!importText.trim()}
          >
            Importer
          </button>
        </div>
      </details>
    </section>
  );
}
