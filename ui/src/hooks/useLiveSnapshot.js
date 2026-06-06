import { startTransition, useEffect, useMemo, useState } from 'react';
import { resolveBackendToken, resolveBackendUrl } from '../utils/api.js';

const RECONNECT_DELAY_MS = 1500;
const MAX_NOTIFICATION_HISTORY = 80;

function isRendererVisible() {
  if (typeof document === 'undefined') {
    return true;
  }
  return document.visibilityState === 'visible';
}

function normalizeSnapshot(snapshot) {
  const processes = Array.isArray(snapshot?.processes) ? snapshot.processes : [];
  return {
    ...snapshot,
    processes,
    processByPid: new Map(processes.map((process) => [process.pid, process]))
  };
}

function normalizeNotification(notification) {
  const fallbackId = `${notification?.type || 'event'}-${notification?.timestamp || Date.now()}`;
  return {
    id: notification?.id || fallbackId,
    type: notification?.type || 'event',
    severity: notification?.severity || 'info',
    title: notification?.title || 'Isolator event',
    message: notification?.message || '',
    timestamp: notification?.timestamp || Date.now() / 1000,
    suppress_in_game_mode: Boolean(notification?.suppress_in_game_mode)
  };
}

function appendNotification(current, notification) {
  const next = [normalizeNotification(notification), ...(current.notifications || [])];
  if (next.length > MAX_NOTIFICATION_HISTORY) {
    next.length = MAX_NOTIFICATION_HISTORY;
  }
  return {
    ...current,
    notifications: next
  };
}

function parseSseFrame(frame) {
  const lines = String(frame).split(/\r?\n/);
  const data = [];
  let eventName = 'message';
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  return { eventName, data: data.join('\n') };
}

export function useLiveSnapshot() {
  const [visible, setVisible] = useState(() => isRendererVisible());
  const [state, setState] = useState({
    connectionState: isRendererVisible() ? 'idle' : 'paused',
    snapshot: null,
    notifications: [],
    lastUpdated: null,
    error: null
  });

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(isRendererVisible());
    };
    const removeTrayListener = window.isolator?.onTrayShow?.(updateVisibility);

    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('focus', updateVisibility);
    window.addEventListener('blur', updateVisibility);
    updateVisibility();

    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      window.removeEventListener('focus', updateVisibility);
      window.removeEventListener('blur', updateVisibility);
      if (typeof removeTrayListener === 'function') {
        removeTrayListener();
      }
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setState((current) => ({
        ...current,
        connectionState: 'paused',
        error: null
      }));
      return undefined;
    }

    let disposed = false;
    let reconnectTimer = null;
    let streamAbort = null;

    const closeStream = () => {
      if (streamAbort) {
        streamAbort.abort();
        streamAbort = null;
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = (message) => {
      closeStream();
      setState((current) => ({
        ...current,
        connectionState: 'error',
        error: message
      }));
      reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
    };

    const handleSnapshot = (data) => {
      if (disposed) {
        return;
      }
      let snapshot;
      try {
        snapshot = normalizeSnapshot(JSON.parse(data));
      } catch (parseError) {
        console.error('[live] failed to parse snapshot frame', parseError);
        scheduleReconnect('malformed live frame');
        return;
      }
      if (window.isolator?.reportStatus) {
        window.isolator.reportStatus(snapshot.status);
      }
      startTransition(() => {
        setState((current) => ({
          connectionState: 'connected',
          snapshot,
          notifications: current.notifications,
          lastUpdated: new Date(),
          error: null
        }));
      });
    };

    const handleNotification = (data) => {
      if (disposed) {
        return;
      }
      let notification;
      try {
        notification = JSON.parse(data);
      } catch (parseError) {
        console.error('[live] failed to parse notification frame', parseError);
        setState((current) => ({
          ...current,
          connectionState: 'error',
          error: 'malformed notification frame'
        }));
        return;
      }
      startTransition(() => {
        setState((current) => appendNotification(current, notification));
      });
    };

    const connect = async () => {
      closeStream();
      setState((current) => ({
        ...current,
        connectionState: 'connecting',
        error: null
      }));

      try {
        const backendUrl = await resolveBackendUrl();
        const backendToken = await resolveBackendToken();
        if (disposed) {
          return;
        }

        const controller = new AbortController();
        streamAbort = controller;
        const response = await fetch(`${backendUrl}/api/live`, {
          signal: controller.signal,
          headers: backendToken ? { Authorization: `Bearer ${backendToken}` } : {}
        });
        if (!response.ok || !response.body) {
          throw new Error(`live stream failed with HTTP ${response.status}`);
        }
        setState((current) => ({
          ...current,
          connectionState: 'connected',
          error: null
        }));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!disposed && streamAbort === controller) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const { eventName, data } = parseSseFrame(frame);
            if (eventName === 'snapshot') {
              handleSnapshot(data);
            } else if (eventName === 'notification') {
              handleNotification(data);
            }
          }
        }
        if (!disposed && streamAbort === controller) {
          throw new Error('live stream disconnected');
        }
      } catch (error) {
        if (disposed || error?.name === 'AbortError') {
          return;
        }
        scheduleReconnect(error instanceof Error ? error.message : 'live stream unavailable');
      }
    };

    connect();

    return () => {
      disposed = true;
      closeStream();
    };
  }, [visible]);

  return useMemo(() => ({ ...state, visible }), [state, visible]);
}
