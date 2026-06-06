import { requestJson } from './api.js';

export async function postLifecycleAction(action) {
  const payload = await requestJson(`/api/${action}`, { method: 'POST' });
  if (payload.status && window.isolator?.reportStatus) {
    window.isolator.reportStatus(payload.status);
  }
  return payload;
}
