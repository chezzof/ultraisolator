import { useEffect, useMemo, useRef, useState } from 'react';
import { Tag } from '@carbon/react';
import NotificationIcon from '@carbon/icons-react/es/Notification.js';
import CloseIcon from '@carbon/icons-react/es/Close.js';
import { DEFAULT_APP_SETTINGS } from '../constants/settings.js';
import { loadAppSettings } from '../utils/appSettings.js';

const TOAST_TTL_MS = 6500;

function severityTagType(severity) {
  if (severity === 'error') {
    return 'red';
  }
  if (severity === 'warning') {
    return 'yellow';
  }
  return 'green';
}

function formatNotificationTime(value) {
  if (!value) {
    return '-';
  }
  return new Date(value * 1000).toLocaleTimeString();
}

export function NotificationCenter({ live }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [toastIds, setToastIds] = useState([]);
  const seenToastIds = useRef(new Set());
  const notifications = Array.isArray(live.notifications) ? live.notifications : [];
  const gameMode = Boolean(live.snapshot?.status?.game_mode);
  const toastsEnabled = settings.notificationToastsEnabled !== false;

  useEffect(() => {
    let disposed = false;
    loadAppSettings().then((payload) => {
      if (!disposed) {
        setSettings(payload);
      }
    });
    const onSettingsUpdated = (event) => {
      setSettings(event.detail || DEFAULT_APP_SETTINGS);
    };
    window.addEventListener('app-settings-updated', onSettingsUpdated);
    return () => {
      disposed = true;
      window.removeEventListener('app-settings-updated', onSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    if (!toastsEnabled || gameMode || notifications.length === 0) {
      return;
    }
    const nextNotification = notifications[0];
    if (
      seenToastIds.current.has(nextNotification.id)
      || (nextNotification.suppress_in_game_mode && gameMode)
    ) {
      return;
    }
    seenToastIds.current.add(nextNotification.id);
    setToastIds((current) => [nextNotification.id, ...current].slice(0, 3));
  }, [gameMode, notifications, toastsEnabled]);

  useEffect(() => {
    if (toastIds.length === 0) {
      return undefined;
    }
    const timers = toastIds.map((id) => window.setTimeout(() => {
      setToastIds((current) => current.filter((toastId) => toastId !== id));
    }, TOAST_TTL_MS));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toastIds]);

  const toastNotifications = useMemo(() => {
    const active = new Set(toastIds);
    return notifications.filter((notification) => active.has(notification.id));
  }, [notifications, toastIds]);

  return (
    <>
      <div className="notification-toast-stack" aria-live="polite">
        {toastNotifications.map((notification) => (
          <section key={notification.id} className={`notification-toast ${notification.severity || 'info'}`}>
            <div className="notification-toast-header">
              <span>{notification.title}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setToastIds((current) => current.filter((id) => id !== notification.id))}
              >
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="notification-toast-message">{notification.message}</div>
          </section>
        ))}
      </div>

      <button
        type="button"
        className={`notification-drawer-toggle${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-controls="notification-history"
        onClick={() => setOpen((current) => !current)}
      >
        <NotificationIcon size={16} />
        <span>{notifications.length}</span>
      </button>

      {open ? (
        <aside className="notification-history-drawer" id="notification-history" aria-label="Notification history">
          <div className="notification-history-header">
            <div>
              <div className="module-title">Notifications</div>
              <div className="notification-history-subtitle">Memory-only session history</div>
            </div>
            <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}>
              <CloseIcon size={16} />
            </button>
          </div>

          <div className="notification-history-list">
            {notifications.length ? notifications.map((notification) => (
              <article key={notification.id} className={`notification-history-item ${notification.severity || 'info'}`}>
                <div className="notification-history-top">
                  <strong>{notification.title}</strong>
                  <Tag type={severityTagType(notification.severity)}>{notification.severity || 'info'}</Tag>
                </div>
                <div className="notification-history-message">{notification.message}</div>
                <div className="notification-history-meta">
                  <span>{notification.type}</span>
                  <span>{formatNotificationTime(notification.timestamp)}</span>
                  {notification.suppress_in_game_mode ? <span>suppress_in_game_mode</span> : null}
                </div>
              </article>
            )) : (
              <div className="module-empty">No notifications in this session</div>
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
