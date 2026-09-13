// Appels à l'API REST GitHub depuis le navigateur (jeton personnel de l'utilisateur).
const API = 'https://api.github.com';

async function gh(cfg, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message ? `GitHub : ${data.message} (${res.status})` : `GitHub : erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const whoAmI = (cfg) => gh(cfg, '/user');

export const dispatchWorkflow = (cfg) =>
  gh(cfg, `/repos/${cfg.repo}/actions/workflows/${encodeURIComponent(cfg.workflow)}/dispatches`, { method: 'POST', body: { ref: cfg.branch } });

export async function latestWorkflowRun(cfg) {
  const data = await gh(cfg, `/repos/${cfg.repo}/actions/workflows/${encodeURIComponent(cfg.workflow)}/runs?per_page=1`);
  return data?.workflow_runs?.[0] || null;
}

const toB64 = (str) => btoa(unescape(encodeURIComponent(str)));
const fromB64 = (b64) => decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));

/** Lit un fichier ; renvoie { content, sha } ou null s'il n'existe pas. */
export async function readFile(cfg, repo, path, branch) {
  try {
    const data = await gh(cfg, `/repos/${repo}/contents/${path}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`);
    return { content: fromB64(data.content || ''), sha: data.sha };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export function writeFile(cfg, repo, path, branch, content, sha, message) {
  return gh(cfg, `/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    body: { message, content: toB64(content), ...(sha ? { sha } : {}), ...(branch ? { branch } : {}) },
  });
}
