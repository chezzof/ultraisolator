export class AppSettingsStore {
  constructor({
    initialSettings,
    load,
    save,
    normalizeSettings,
    normalizePatch
  }) {
    this.load = load;
    this.save = save;
    this.normalizeSettings = normalizeSettings;
    this.normalizePatch = normalizePatch;
    this.listeners = new Set();
    this.committed = normalizeSettings(initialSettings);
    this.snapshot = {
      settings: this.committed,
      ready: false,
      error: null,
      revision: this.committed.revision || 0
    };
    this.localRevision = 0;
    this.writeQueue = Promise.resolve();
    this.initializePromise = null;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  publish(next) {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  initialize() {
    if (this.initializePromise) {
      return this.initializePromise;
    }
    const revisionAtStart = this.localRevision;
    this.initializePromise = this.load().then((loaded) => {
      const normalized = this.normalizeSettings(loaded);
      if (
        revisionAtStart === this.localRevision
        && (normalized.revision || 0) >= (this.committed.revision || 0)
      ) {
        this.committed = normalized;
        this.publish({
          settings: normalized,
          ready: true,
          error: null,
          revision: normalized.revision || 0
        });
      } else {
        this.publish({ ...this.snapshot, ready: true });
      }
      return this.snapshot.settings;
    }).catch((error) => {
      this.publish({ ...this.snapshot, ready: true, error });
      throw error;
    });
    return this.initializePromise;
  }

  update(patch) {
    const normalizedPatch = this.normalizePatch(patch);
    if (Object.keys(normalizedPatch).length === 0) {
      return Promise.resolve(this.snapshot.settings);
    }

    const revision = ++this.localRevision;
    const optimistic = this.normalizeSettings({
      ...this.snapshot.settings,
      ...normalizedPatch
    });
    this.publish({
      settings: optimistic,
      ready: true,
      error: null,
      revision: Math.max(revision, optimistic.revision || 0)
    });

    const operation = this.writeQueue.then(async () => {
      try {
        const saved = this.normalizeSettings(await this.save(normalizedPatch));
        if ((saved.revision || 0) < (this.committed.revision || 0)) {
          throw new Error('stale app settings revision');
        }
        this.committed = saved;
        if (revision === this.localRevision) {
          this.publish({
            settings: saved,
            ready: true,
            error: null,
            revision: Math.max(revision, saved.revision || 0)
          });
        }
        return saved;
      } catch (error) {
        if (revision === this.localRevision) {
          this.publish({
            settings: this.committed,
            ready: true,
            error,
            revision: Math.max(revision, this.committed.revision || 0)
          });
        }
        throw error;
      }
    });

    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
