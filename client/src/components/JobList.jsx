import React, { useEffect, useRef, useState } from 'react';
import JobCard from './JobCard.jsx';

// Affichage par tranches : toutes les offres filtrées sont disponibles, mais seules les premières sont
// dessinées ; la tranche suivante s'ajoute en arrivant en bas de liste (ou avec le bouton).
const PAGE = 200;

export default function JobList({ jobs, meta, selectedId, onSelect, onUpdate }) {
  const [visible, setVisible] = useState(PAGE);
  const moreRef = useRef(null);
  const listRef = useRef(null);
  const remaining = jobs.length - visible;

  useEffect(() => {
    // Liste recréée à chaque changement de filtre ou de tri : si on était descendu, retour en haut.
    if (listRef.current && listRef.current.getBoundingClientRect().top < 0) window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const el = moreRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    // Recréé à chaque tranche : si le bouton reste visible (grand écran), la tranche suivante s'ajoute aussi.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE);
    }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, jobs.length]);

  if (!jobs.length)
    return (
      <div className="empty">
        <p>Aucune offre ne correspond à ces filtres.</p>
        <p className="muted">Cliquez sur « Actualiser » pour interroger les plateformes, ou élargissez la période / les filtres.</p>
      </div>
    );
  return (
    <div className="job-list" ref={listRef}>
      {jobs.slice(0, visible).map((job) => (
        <JobCard key={job.id} job={job} meta={meta} selected={job.id === selectedId} onSelect={onSelect} onUpdate={onUpdate} />
      ))}
      {remaining > 0 ? (
        <button ref={moreRef} className="secondary-btn load-more" onClick={() => setVisible((v) => v + PAGE)}>
          Afficher {Math.min(PAGE, remaining)} offres de plus ({remaining} restantes)
        </button>
      ) : null}
    </div>
  );
}
