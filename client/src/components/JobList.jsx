import React from 'react';
import JobCard from './JobCard.jsx';

export default function JobList({ jobs, meta, selectedId, onSelect, onUpdate }) {
  if (!jobs.length)
    return (
      <div className="empty">
        <p>Aucune offre ne correspond à ces filtres.</p>
        <p className="muted">Cliquez sur « Actualiser » pour interroger les plateformes, ou élargissez la période / les filtres.</p>
      </div>
    );
  return (
    <div className="job-list">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} meta={meta} selected={job.id === selectedId} onSelect={onSelect} onUpdate={onUpdate} />
      ))}
    </div>
  );
}
