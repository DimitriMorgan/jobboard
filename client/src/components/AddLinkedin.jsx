import React, { useEffect, useState } from 'react';

/** Ajout manuel de posts / offres LinkedIn vus dans le fil : le contenu est lu côté serveur (GitHub Actions). */
export default function AddLinkedin({ initial = '', onSubmit, onClose, isStatic }) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  const urls = text.split(/[\s,;]+/).filter((u) => /linkedin\.com\/(?:posts|feed\/update|jobs\/view)|urn:li:activity|currentJobId=/.test(u));
  const bookmarklet = `javascript:location.href='${location.origin}${location.pathname}#add='+encodeURIComponent(location.href)`;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Ajouter un post LinkedIn">
        <header className="drawer-header">
          <h2>Ajouter un post ou une offre LinkedIn</h2>
          <button className="icon" onClick={onClose} title="Fermer">
            ×
          </button>
        </header>
        <p className="muted small">
          Collez l’adresse d’un post vu dans votre fil (menu « … » du post → « Copier le lien vers le post ») ou d’une offre LinkedIn. Plusieurs adresses possibles, une par ligne.
          Le texte du post est lu automatiquement : intitulé, auteur, date, contrat, TJM ou salaire.
        </p>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://www.linkedin.com/posts/…  ou  https://www.linkedin.com/feed/update/urn:li:activity:…" />
        <div className="settings-actions">
          <button className="primary" disabled={!urls.length} onClick={() => onSubmit(urls)}>
            Ajouter {urls.length > 1 ? `${urls.length} liens` : ''}
          </button>
          <span className="muted small">{isStatic ? 'Traité par GitHub Actions en 1 à 2 minutes (jeton GitHub requis).' : 'Traité par le serveur en quelques secondes.'}</span>
        </div>
        <details className="settings-backup">
          <summary>Raccourci navigateur (favori « Ajouter au JobBoard »)</summary>
          <p className="small muted">
            Glissez ce lien dans votre barre de favoris. Sur la page d’un post ou d’une offre LinkedIn, cliquez-le : le JobBoard s’ouvre avec l’adresse pré-remplie.
          </p>
          <a className="manual-link" href={bookmarklet} onClick={(e) => e.preventDefault()}>
            ＋ Ajouter au JobBoard
          </a>
        </details>
      </div>
    </>
  );
}
