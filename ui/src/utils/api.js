export const DEFAULT_BACKEND_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';

export async function resolveBackendUrl() {
  if (window.isolator?.getBackendUrl) {
    const backendUrl = await window.isolator.getBackendUrl();
    if (backendUrl) {
      return backendUrl;
    }
  }
  return DEFAULT_BACKEND_URL;
}

export async function resolveBackendToken() {
  if (window.isolator?.getBackendToken) {
    return await window.isolator.getBackendToken();
  }
  return import.meta.env.VITE_API_TOKEN || '';
}

export async function requestJson(path, options = {}) {
  const backendUrl = await resolveBackendUrl();
  const token = await resolveBackendToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${backendUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = { ok: false, error: `${options.method || 'GET'} ${path} returned non-JSON response` };
    }
  }
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `${options.method || 'GET'} ${path} failed with HTTP ${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}
