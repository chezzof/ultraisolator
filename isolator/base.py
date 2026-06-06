"""BaseMixin implementation slice."""

from .winapi import *


class BaseMixin:
    def _register_capability_defaults(self):
        if not self._is_admin:
            self._note_capability("Administrator rights not detected: HKLM IFEO writes are disabled.")
            self._note_capability("Protected/system processes may reject tuning requests and will be skipped.")
        if self.event_backend != "poll":
            self._note_capability("Only the polling backend is implemented in this build. Falling back to poll mode.")
            self.event_backend = "poll"
        if self.allow_mmcss_injection:
            self._note_capability("Remote MMCSS injection is disabled by design. Ignoring allow_mmcss_injection=true.")
            self.allow_mmcss_injection = False
        if self.auto_detect_steam:
            self._note_capability("Steam auto-detection enabled.")
        if self.auto_detect_epic:
            self._note_capability("Epic Games auto-detection enabled.")

    def _note_capability(self, message):
        if message not in self._capability_notes_seen:
            self._capability_notes_seen.add(message)
            self._capability_notes.append(message)

    def set_log_file(self, path):
        self._close_log_file()
        if not path:
            self._log_file_path = None
            self._log_use_timestamp = False
            return
        from server.config_store import ConfigStore
        validated = ConfigStore(getattr(self, "config_path", "config.json")).validate({"log_file": str(path)}, partial=True)
        self._log_file_path = str(validated["log_file"])
        self._log_file_handle = open(self._log_file_path, "a", encoding="utf-8", buffering=1)
        self._log_use_timestamp = True

    def _close_log_file(self):
        handle = getattr(self, "_log_file_handle", None)
        if handle:
            try:
                handle.flush()
                handle.close()
            except OSError:
                pass
        self._log_file_handle = None
        self._log_file_path = None
        self._log_use_timestamp = False

    def _log(self, message):
        if getattr(self, "_log_use_timestamp", False):
            message = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}"
        print(message, flush=True)
        handle = getattr(self, "_log_file_handle", None)
        if handle:
            handle.write(message + "\n")

    def _log_once(self, key, message):
        now = time.monotonic()
        dedup_key = self._dedup_log_key(key, message)
        with self._state_lock:
            self._prune_reported_failures_locked(now)
            if dedup_key in self._reported_failures:
                self._reported_failures.pop(dedup_key, None)
                self._reported_failures[dedup_key] = now
                return
            while len(self._reported_failures) >= self._reported_failure_limit:
                oldest = next(iter(self._reported_failures), None)
                if oldest is None:
                    break
                self._reported_failures.pop(oldest, None)
            self._reported_failures[dedup_key] = now
        self._log(message)

    def _dedup_log_key(self, key, message):
        if isinstance(key, tuple) and len(key) == 2 and key[0] == "monitor_exception":
            return key + (self._scrub_log_once_message(message),)
        return key

    def _scrub_log_once_message(self, message):
        text = str(message)
        text = re.sub(r"(?i)\b[A-Z]:\\[^\s]+", "<path>", text)
        text = re.sub(r"(?i)\bpid=\d+\b", "pid=<n>", text)
        text = re.sub(r"\b\d{2,}\b", "<n>", text)
        return text[: self._reported_failure_message_chars]

    def _prune_reported_failures_locked(self, now=None):
        if now is None:
            now = time.monotonic()
        ttl = float(getattr(self, "_reported_failure_ttl_s", 3600.0))
        if ttl > 0:
            for key, seen_at in list(self._reported_failures.items()):
                if now - float(seen_at) >= ttl:
                    self._reported_failures.pop(key, None)
        limit = int(getattr(self, "_reported_failure_limit", 5000))
        while len(self._reported_failures) > limit:
            oldest = next(iter(self._reported_failures), None)
            if oldest is None:
                break
            self._reported_failures.pop(oldest, None)

    def _check_admin(self):
        # WHY: Prefer TokenElevation over IsUserAnAdmin. IsUserAnAdmin
        # is documented as deprecated and on systems with split UAC tokens
        # it can report False even though the token can be elevated. The
        # TokenElevation query asks the kernel directly whether the CURRENT
        # token is running elevated. Fall back to IsUserAnAdmin if the
        # token APIs are unavailable.
        try:
            token_handle = wintypes.HANDLE()
            if advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), TOKEN_QUERY, ctypes.byref(token_handle)):
                try:
                    elevation = TOKEN_ELEVATION()
                    length = wintypes.DWORD()
                    if advapi32.GetTokenInformation(
                            token_handle, TokenElevation,
                            ctypes.byref(elevation), ctypes.sizeof(elevation),
                            ctypes.byref(length)):
                        return bool(elevation.TokenIsElevated)
                finally:
                    kernel32.CloseHandle(token_handle)
        except Exception:
            pass
        try:
            return bool(shell32.IsUserAnAdmin())
        except Exception:
            return False

    def _load_config(self):
        from server.config_store import ConfigError, ConfigStore
        store = ConfigStore(self.config_path)
        try:
            return store.read()["config"]
        except ConfigError as exc:
            fields = ", ".join(error.get("field", "$") for error in exc.errors[:5])
            self._log(f"[WARN] Invalid config {self.config_path}; using defaults. Fields: {fields}")
        except Exception as exc:
            self._log(f"[WARN] Failed to load {self.config_path}: {exc}")
        return store.defaults_response()["defaults"]

    def _normalize_name(self, name):
        if not name:
            return ""
        return os.path.basename(str(name)).strip().lower()

    def _normalize_game_name(self, name):
        # WHY: Game names from user config should match Windows process names,
        # which always end with .exe for user-mode executables. Without this,
        # a config entry of "cs2" silently never matches the actual "cs2.exe"
        # process — a footgun. We add .exe ONLY when there is no extension
        # at all (no dot), so config entries that already include the extension
        # are unchanged.
        n = self._normalize_name(name)
        # WHY (item 4): Canonicalize trailing dots / odd forms so denylist and
        # game-name comparisons cannot be bypassed. Windows ignores trailing
        # dots and whitespace on a filename, so "lsass.exe." and "lsass.exe "
        # both launch lsass.exe — strip them before comparison. Collapse a
        # doubled ".exe.exe" too. Only append ".exe" when there is no extension.
        n = n.rstrip(". \t")
        while n.endswith(".exe.exe"):
            n = n[:-4]
        if n and "." not in n:
            n += ".exe"
        return n

    @staticmethod
    def _safe_int(value, default):
        try:
            return int(value)
        except (ValueError, TypeError):
            return int(default)

    def _last_error_text(self):
        error_code = ctypes.get_last_error()
        if not error_code:
            return "unknown error"
        return f"{error_code}: {ctypes.FormatError(error_code).strip()}"

    def _open_process(self, pid, access, quiet=False):
        handle = kernel32.OpenProcess(access, False, int(pid))
        if handle:
            return handle
        error_code = ctypes.get_last_error()
        if error_code in (5, 87):
            return None
        if not quiet:
            error_text = f"{error_code}: {ctypes.FormatError(error_code).strip()}"
            self._log_once(("open_process", int(pid), access, error_code), f"[WARN] OpenProcess failed for pid={pid}: {error_text}")
        return None

    def _open_thread(self, thread_id, access, quiet=False):
        handle = kernel32.OpenThread(access, False, int(thread_id))
        if handle:
            return handle
        if not quiet:
            error_code = ctypes.get_last_error()
            error_text = f"{error_code}: {ctypes.FormatError(error_code).strip()}"
            self._log_once(("open_thread", int(thread_id), access, error_code), f"[WARN] OpenThread failed for tid={thread_id}: {error_text}")
        return None
