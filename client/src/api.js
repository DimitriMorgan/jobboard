async function http(url, opts = {}) {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);
  return data;
}

export const api = {
  meta: () => http('/api/meta'),
  stats: () => http('/api/stats'),
  sources: () => http('/api/sources'),
  jobs: (filters) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (Array.isArray(v)) {
        if (v.length) params.set(k, v.join(','));
      } else if (v !== '' && v !== false && v != null && v !== 0) params.set(k, String(v));
    }
    return http(`/api/jobs?${params}`);
  },
  job: (id) => http(`/api/jobs/${encodeURIComponent(id)}`),
  updateJob: (id, patch) => http(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  refresh: (only) => http('/api/refresh', { method: 'POST', body: JSON.stringify({ only: only?.join(',') || '' }) }),
  refreshStatus: () => http('/api/refresh/status'),
  manualLinks: (tech, contract) => http(`/api/manual-links?tech=${tech}&contract=${contract || ''}`),
};

export const STATUS_LABELS = {
  nouveau: 'Nouveau',
  vu: 'Vu',
  a_postuler: 'À postuler',
  candidature_envoyee: 'Candidature envoyée',
  relance: 'Relancé',
  entretien: 'Entretien',
  offre_recue: 'Offre reçue',
  refus: 'Refus',
  ignore: 'Ignoré',
};

export const CONTRACT_LABELS = { freelance: 'Freelance', cdi: 'CDI', cdd: 'CDD', interim: 'Intérim', alternance: 'Alternance', stage: 'Stage', autre: 'Autre' };
export const REMOTE_LABELS = { full: 'Full remote', partial: 'Télétravail partiel', none: 'Sur site' };

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 86400e3;
  if (diff < 1) return "aujourd'hui";
  if (diff < 2) return 'hier';
  if (diff < 30) return `il y a ${Math.floor(diff)} j`;
  return d.toLocaleDateString('fr-FR');
}

export function formatDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}
