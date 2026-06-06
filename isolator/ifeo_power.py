"""IfeoPowerMixin implementation slice."""

from .winapi import *


class IfeoPowerMixin:
    @staticmethod
    def _unpack_ifeo_value(stored):
        # WHY (item 1): Snapshot values are now {"value", "type"} dicts so the
        # original registry type survives a capture→restore round trip. Accept
        # the legacy bare-value form too, in case an older backup file is read.
        if isinstance(stored, dict):
            return stored.get("value"), stored.get("type")
        return stored, None

    @staticmethod
    def _encode_ifeo_snapshot(snapshot):
        # WHY (item 2): REG_BINARY values come back from QueryValueEx as `bytes`,
        # which json.dump cannot serialize — the previous code silently failed to
        # write the on-disk backup, so crash recovery had no record and the IFEO
        # keys leaked forever. Encode bytes as {"__bytes__": <hex>} so the backup
        # always serializes and round-trips losslessly.
        encoded = dict(snapshot)
        encoded_values = {}
        for value_name, stored in snapshot.get("values", {}).items():
            value, value_type = IfeoPowerMixin._unpack_ifeo_value(stored)
            if isinstance(value, (bytes, bytearray)):
                value = {"__bytes__": bytes(value).hex()}
            encoded_values[value_name] = {"value": value, "type": value_type}
        encoded["values"] = encoded_values
        return encoded

    @staticmethod
    def _decode_ifeo_snapshot(snapshot):
        # WHY (item 2): Reverse _encode_ifeo_snapshot — turn hex-encoded bytes
        # back into `bytes` so the restore path writes the original REG_BINARY.
        if not isinstance(snapshot, dict):
            return snapshot
        decoded = dict(snapshot)
        decoded_values = {}
        for value_name, stored in snapshot.get("values", {}).items():
            value, value_type = IfeoPowerMixin._unpack_ifeo_value(stored)
            if isinstance(value, dict) and "__bytes__" in value:
                try:
                    value = bytes.fromhex(value["__bytes__"])
                except (ValueError, TypeError):
                    value = None
            decoded_values[value_name] = {"value": value, "type": value_type}
        decoded["values"] = decoded_values
        return decoded

    def _capture_ifeo_snapshot(self, exe_name):
        if exe_name in self._ifeo_original:
            return
        base_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"
        exe_path = f"{base_path}\\{exe_name}"
        perf_path = f"{exe_path}\\PerfOptions"
        snapshot = {
            "exe_path": exe_path,
            "perf_path": perf_path,
            "exe_key_exists": False,
            "perf_key_exists": False,
            "values": {},
        }

        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, exe_path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY):
                snapshot["exe_key_exists"] = True
        except OSError:
            pass

        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, perf_path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as perf_key:
                snapshot["perf_key_exists"] = True
                for value_name in IFEO_VALUES:
                    # WHY (item 1): Capture the original registry value TYPE
                    # alongside the value. The restore path used to rewrite
                    # everything as REG_DWORD, corrupting pre-existing
                    # non-DWORD PerfOptions values (e.g. REG_BINARY). We store
                    # {value, type} so restore can write back with the exact
                    # original type — or DELETE when no prior value existed.
                    try:
                        value, value_type = winreg.QueryValueEx(perf_key, value_name)
                    except FileNotFoundError:
                        value, value_type = None, None
                    snapshot["values"][value_name] = {"value": value, "type": value_type}
        except OSError:
            snapshot["values"] = {value_name: {"value": None, "type": None} for value_name in IFEO_VALUES}

        self._ifeo_original[exe_name] = snapshot

    def _load_ifeo_backups(self):
        try:
            if os.path.exists(IFEO_BACKUP_PATH):
                with open(IFEO_BACKUP_PATH, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                
                # Validate against live registry
                valid_snapshots = {}
                for exe_name, snapshot in loaded.items():
                    # Check if the exe key exists
                    exe_key_exists = False
                    try:
                        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, snapshot["exe_path"], 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY):
                            exe_key_exists = True
                    except OSError:
                        pass
                    
                    # Check if the perf key exists
                    perf_key_exists = False
                    try:
                        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, snapshot["perf_path"], 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY):
                            perf_key_exists = True
                    except OSError:
                        pass
                    
                    # If live state matches snapshot (or snapshot thought it didn't exist and it still doesn't), keep it
                    # But if the key was deleted out from under us, drop the snapshot so we don't restore garbage
                    if snapshot.get("exe_key_exists") and not exe_key_exists:
                        continue
                    if snapshot.get("perf_key_exists") and not perf_key_exists:
                        continue

                    # WHY: Do NOT overwrite snapshot["*_key_exists"] with the
                    # current state. Those flags must preserve the pre-write
                    # reality ("did this key exist before WE created it?") so
                    # that _restore_ifeo_priorities knows whether to DELETE
                    # the keys we created. Overwriting here would silently
                    # flip a False (we created it) to True (still exists
                    # because we created it) and the cleanup branch
                    # `if not snapshot["perf_key_exists"]: DeleteKey(...)`
                    # would never fire — leaking IFEO entries permanently.
                    # WHY (item 2): Decode hex-encoded REG_BINARY values back
                    # into bytes so the restore path writes the original type.
                    valid_snapshots[exe_name] = self._decode_ifeo_snapshot(snapshot)

                self._ifeo_original = valid_snapshots
        except Exception as exc:
            # WHY: Key dedup by exception TYPE name (not repr) for consistency
            # with the monitor-loop convention. repr embeds run-specific
            # details that defeat dedup across launches.
            self._log_once(("ifeo_load_backup", type(exc).__name__), f"[WARN] Failed to load IFEO backup: {exc}")

    def _save_ifeo_backups(self):
        tmp = IFEO_BACKUP_PATH + ".tmp"
        # WHY (item 2): Encode each snapshot so REG_BINARY (bytes) values are
        # serializable; without this json.dump raised and the backup was never
        # written, leaving crash recovery with no record of leaked IFEO keys.
        serializable = {
            exe_name: self._encode_ifeo_snapshot(snapshot)
            for exe_name, snapshot in self._ifeo_original.items()
        }
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(serializable, f)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, IFEO_BACKUP_PATH)
        except OSError as exc:
            # WHY (item 2): Only clean up the temp file on real I/O errors, and
            # log so the failure is visible. We deliberately do NOT swallow a
            # serialization error and silently delete the temp file — that hid
            # the original REG_BINARY bug. Encoding above makes the dump
            # non-throwing, so any exception here is genuine disk/permission I/O.
            self._log_once(("ifeo_save_backup", type(exc).__name__), f"[WARN] Failed to save IFEO backup: {exc}")
            try:
                os.remove(tmp)
            except OSError:
                pass

    def _set_ifeo_priority(self, exe_name):
        # WHY: Use _normalize_game_name (not _normalize_name) so that user
        # config entries like "cs2" (no extension) match the IFEO key format
        # Windows actually looks up at process launch ("cs2.exe"). Without
        # this, an extension-less config entry silently writes the WRONG
        # registry key (Image File Execution Options\cs2 instead of
        # \cs2.exe), and the IFEO priority hint never applies.
        exe_name = self._normalize_game_name(exe_name)
        if not exe_name or not self._is_admin:
            return False
        # WHY (item 4): Check BOTH the game-normalized form (always ends .exe)
        # and the bare canonical basename. The denylist holds a few extension-
        # less special names ("system", "registry", "memcompression",
        # "secure system") that would never match the forced-.exe form. The
        # bare form (basename + lower + trailing-dot/space strip) catches them
        # and any odd bypass spelling.
        bare_name = self._normalize_name(exe_name).rstrip(". \t")
        if exe_name in IFEO_DENIED_EXES or bare_name in IFEO_DENIED_EXES:
            self._log_once(("ifeo_denied_exe", exe_name), f"[WARN] IFEO write blocked for protected/system executable: {exe_name}.")
            return False

        self._capture_ifeo_snapshot(exe_name)
        snapshot = self._ifeo_original[exe_name]
        write_ok = False
        try:
            with winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE, snapshot["perf_path"], 0, winreg.KEY_WRITE | winreg.KEY_WOW64_64KEY) as perf_key:
                for value_name, value in IFEO_VALUES.items():
                    winreg.SetValueEx(perf_key, value_name, 0, winreg.REG_DWORD, value)
            write_ok = True
        except PermissionError:
            self._note_capability("IFEO writes were denied by the OS. Session-only IFEO rollback is unavailable.")
            self._log_once(("ifeo_permission", exe_name), f"[WARN] IFEO write denied for {exe_name}.")
        except OSError as exc:
            self._log_once(("ifeo_error", exe_name), f"[WARN] Failed to write IFEO for {exe_name}: {exc}")
        # WHY: Persist the snapshot AFTER the registry write attempt rather
        # than before. The previous order (save → write) meant a crash
        # between save and write would leave an on-disk record claiming we
        # modified state we hadn't touched. We persist even on failure
        # because CreateKeyEx may have succeeded (creating the parent perf
        # key) before SetValueEx failed; the snapshot is then required to
        # locate and DELETE that orphan on next launch's _restore step.
        self._save_ifeo_backups()
        return write_ok

    def _apply_configured_game_ifeo_priorities(self):
        # WHY: IFEO CpuPriorityClass is the same class of tweak as runtime
        # SetPriorityClass — honor disable_game_priority_boost for both.
        if self._disable_game_priority_boost:
            return
        for game in self.config.get("games", []):
            self._set_ifeo_priority(game)

    def _apply_ifeo_priority_fallback(self, name):
        normalized = self._normalize_name(name)
        if self._normalize_game_name(name) in self.games:
            if self._set_ifeo_priority(name):
                self._log_once(
                    ("ifeo_runtime_fallback", normalized),
                    f"[INFO] Runtime priority change denied for {name}; IFEO fallback applied for next launch.",
                )
        else:
            self._log_once(
                ("ifeo_runtime_skip_auto", normalized),
                f"[INFO] Runtime priority change denied for {name}; IFEO fallback skipped (auto-detected — add to 'games' config to enable).",
            )

    def _restore_ifeo_priorities(self):
        if not self._ifeo_original:
            return

        # WHY: Track per-exe success so we only delete the on-disk backup file
        # if EVERY entry was restored. The previous unconditional delete meant
        # a session that lost admin rights between launches would log
        # PermissionError for each entry then still wipe the backup file,
        # leaving no recovery path on the next admin-elevated launch.
        restored = []
        for exe_name, snapshot in list(self._ifeo_original.items()):
            try:
                with winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE, snapshot["perf_path"], 0, winreg.KEY_WRITE | winreg.KEY_WOW64_64KEY) as perf_key:
                    for value_name, original in snapshot["values"].items():
                        # WHY (item 1): Restore using the captured original
                        # TYPE, not a hard-coded REG_DWORD. If no prior value
                        # existed (value is None) we DELETE the value we wrote
                        # rather than leaving a bogus DWORD behind.
                        original_value, original_type = self._unpack_ifeo_value(original)
                        if original_value is None:
                            try:
                                winreg.DeleteValue(perf_key, value_name)
                            except FileNotFoundError:
                                pass
                        else:
                            winreg.SetValueEx(perf_key, value_name, 0, original_type if original_type is not None else winreg.REG_DWORD, original_value)

                if not snapshot["perf_key_exists"]:
                    try:
                        winreg.DeleteKey(winreg.HKEY_LOCAL_MACHINE, snapshot["perf_path"])
                    except OSError:
                        pass

                if not snapshot["exe_key_exists"]:
                    try:
                        winreg.DeleteKey(winreg.HKEY_LOCAL_MACHINE, snapshot["exe_path"])
                    except OSError:
                        pass
                restored.append(exe_name)
            except PermissionError:
                self._log_once(("restore_ifeo_permission", exe_name), f"[WARN] Could not restore IFEO for {exe_name}; administrative rights are required.")
            except OSError as exc:
                self._log_once(("restore_ifeo_error", exe_name), f"[WARN] Failed to restore IFEO for {exe_name}: {exc}")

        for exe_name in restored:
            self._ifeo_original.pop(exe_name, None)

        if not self._ifeo_original:
            try:
                if os.path.exists(IFEO_BACKUP_PATH):
                    os.remove(IFEO_BACKUP_PATH)
            except OSError:
                pass
        else:
            # Persist surviving entries so a subsequent admin launch can retry.
            self._save_ifeo_backups()

    def _get_active_power_scheme(self):
        guid_ptr = ctypes.POINTER(GUID)()
        result = powrprof.PowerGetActiveScheme(None, ctypes.byref(guid_ptr))
        # WHY: Defensive LocalFree on the error path. The API contract says
        # guid_ptr is only valid on success, but if a hooked/broken impl ever
        # sets the out-pointer AND returns non-zero, we still own the buffer.
        if result != 0:
            if guid_ptr:
                kernel32.LocalFree(ctypes.cast(guid_ptr, ctypes.c_void_p))
            self._log_once(("power_get_active_scheme", result), f"[WARN] PowerGetActiveScheme failed: {result}")
            return None
        if not guid_ptr:
            return None
        try:
            guid = guid_ptr.contents
            return GUID(guid.Data1, guid.Data2, guid.Data3, (ctypes.c_ubyte * 8)(*guid.Data4))
        finally:
            kernel32.LocalFree(ctypes.cast(guid_ptr, ctypes.c_void_p))

    def _set_power_scheme(self, guid):
        if not guid:
            return False
        return powrprof.PowerSetActiveScheme(None, ctypes.byref(guid)) == 0

    def _enumerate_power_scheme_guids(self):
        # WHY: Return GUIDs of all power schemes that are CURRENTLY REGISTERED
        # on this machine (i.e. visible in Control Panel → Power Options or
        # `powercfg /list`). Used to verify a target template GUID is real
        # before activating it — so the tool never causes a scheme to be
        # auto-created by OEM/AMD/NVIDIA driver power services that watch
        # for the well-known Ultimate Performance GUID.
        guids = []
        index = 0
        # Safety cap: a sane system has <20 power schemes; 256 is a hard
        # ceiling against any pathological enumerator that never reports
        # ERROR_NO_MORE_ITEMS.
        while index < 256:
            scheme_guid = GUID()
            size = wintypes.DWORD(ctypes.sizeof(scheme_guid))
            result = powrprof.PowerEnumerate(
                None, None, None,
                wintypes.ULONG(POWER_ACCESS_SCHEME),
                wintypes.ULONG(index),
                ctypes.cast(ctypes.byref(scheme_guid), ctypes.POINTER(ctypes.c_ubyte)),
                ctypes.byref(size),
            )
            if result != 0:
                break  # ERROR_NO_MORE_ITEMS or any other error: stop.
            # Copy out so the loop's reused ctypes object cannot mutate
            # entries we already appended.
            guids.append(GUID(
                scheme_guid.Data1, scheme_guid.Data2, scheme_guid.Data3,
                (ctypes.c_ubyte * 8)(*scheme_guid.Data4),
            ))
            index += 1
        return guids

    @staticmethod
    def _guids_equal(a, b):
        if a is None or b is None:
            return False
        if (int(a.Data1) != int(b.Data1) or int(a.Data2) != int(b.Data2)
                or int(a.Data3) != int(b.Data3)):
            return False
        return bytes(a.Data4) == bytes(b.Data4)

    def _set_preferred_power_scheme(self):
        # WHY: Config escape hatch. Users who saw "Ultimate Performance"
        # duplicate plans accumulate in their Power Options can disable the
        # switch entirely without giving up the rest of the tool.
        if self._disable_power_scheme_switch:
            self._log_once(("power_scheme_disabled_via_config",),
                           "[INFO] Power scheme switching disabled via config (disable_power_scheme_switch=true). Leaving user's plan as-is.")
            return False

        # WHY: If the user is already on Ultimate / High Performance, we do
        # NOT switch and we leave `_power_plan_active = False` so that
        # _restore_power_scheme correctly treats the eventual restore as a
        # no-op — the original was already what we want, so there is nothing
        # to revert. _log_once is used so the "already-on" message appears
        # exactly once per process lifetime instead of every game session
        # (the monitor loop resets `power_scheme_attempted` after each game).
        original = self._original_power_scheme
        if original is not None:
            if self._guids_equal(original, self.ultimate_guid):
                self._log_once(("power_already_ultimate",),
                               "[INFO] User is already on Ultimate Performance power scheme. Leaving as-is.")
                return True
            if self._guids_equal(original, self.high_performance_guid):
                self._log_once(("power_already_high",),
                               "[INFO] User is already on High Performance power scheme. Leaving as-is.")
                return True
        else:
            self._log_once(
                ("power_original_unknown",),
                "[WARN] Original power scheme could not be captured; power scheme switching skipped to preserve crash recovery.",
            )
            return False

        if not self._write_power_recovery_state(original_scheme=original, switched=False):
            self._log_once(
                ("power_recovery_state_unavailable",),
                "[WARN] Could not persist power recovery state; power scheme switching skipped.",
            )
            return False

        # WHY: Only attempt to activate schemes that are ACTUALLY REGISTERED
        # on this system. On some Windows editions / OEM driver stacks,
        # invoking PowerSetActiveScheme with a well-known but unregistered
        # template GUID (notably the Ultimate Performance GUID) has been
        # reported to leave duplicate "Ultimate Performance" entries in
        # Power Options that the user then has to clean up manually. The
        # enumeration check guarantees we only activate plans the user
        # could already see in Control Panel.
        registered = self._enumerate_power_scheme_guids()
        for label, guid in (("ultimate", self.ultimate_guid), ("high", self.high_performance_guid)):
            if not any(self._guids_equal(guid, r) for r in registered):
                self._log_once(
                    (f"power_{label}_not_registered",),
                    f"[INFO] {label.capitalize()} Performance scheme is not registered on this system; skipping to avoid creating duplicate plans.",
                )
                continue
            if not getattr(self, "_power_scheme_set_unverified", False):
                if not self._write_power_recovery_state(
                    original_scheme=original,
                    switched=True,
                    scheme_in_use=label,
                ):
                    self._log_once(
                        ("power_recovery_state_before_switch",),
                        "[WARN] Could not persist pre-switch power recovery state; power scheme switching skipped.",
                    )
                    return False
            if self._set_power_scheme(guid):
                active = self._get_active_power_scheme()
                if self._guids_equal(active, guid):
                    self._power_plan_active = True
                    self._power_scheme_in_use = label
                    self._log(f"[INFO] Activated {label} performance power scheme.")
                    return True
                self._log_once(
                    ("power_scheme_verify_failed", label),
                    f"[WARN] PowerSetActiveScheme reported success for {label}, but verify readback did not match.",
                )
                # WHY (item 3): PowerSetActiveScheme SUCCEEDED — the system may
                # actually be switched even though the verify readback didn't
                # match (transient readback failure / OEM power service race).
                # Previously we wrote switched=False here, abandoning the
                # recovery record and leaving the user stuck in the gaming
                # scheme permanently. Instead we LEAVE the pre-switch
                # recovery state (switched=True, scheme_in_use=label, original
                # persisted) in place so crash/next-launch recovery reverts it,
                # and we flag the live session so _restore_power_scheme also
                # reverts on this run's normal shutdown. We continue to try the
                # next label without overwriting that record.
                self._power_scheme_set_unverified = True
                self._power_scheme_unverified_in_use = label
                continue
            # Set call itself failed: nothing was changed for this label, so
            # roll the recovery record back to switched=False.
            if not getattr(self, "_power_scheme_set_unverified", False):
                self._write_power_recovery_state(original_scheme=original, switched=False)
        self._log_once(("power_scheme_set_failed",),
                       "[INFO] No preferred gaming power scheme is registered; leaving the user's current scheme untouched.")
        return False

    def _restore_power_scheme(self):
        # WHY (item 3): A scheme can be "actually changed but unverified" — the
        # set call succeeded yet the verify readback failed in
        # _set_preferred_power_scheme. In that case _power_plan_active is False
        # (we never confirmed it), but we DID mutate the system. Treat that as
        # something to revert so the early-return below cannot skip it.
        set_unverified = bool(getattr(self, "_power_scheme_set_unverified", False))
        # Tightened early-return: only bail out when recovery is incomplete AND
        # there is genuinely nothing we changed this session (no active plan and
        # no unverified set).
        if self._persistent_recovery_incomplete and not self._power_plan_active and not set_unverified:
            return
        if set_unverified and not self._power_plan_active and self._original_power_scheme:
            # WHY (item 3): We could not verify the switch on the way in, so we
            # cannot trust a verify-match guard now either. Force the original
            # scheme back and clear the recovery record unconditionally.
            if self._set_power_scheme(self._original_power_scheme):
                label = getattr(self, "_power_scheme_unverified_in_use", None)
                if label:
                    self._log(f"[INFO] Restored original power scheme. Disabled unverified {label} performance mode.")
                self._clear_power_recovery_state()
            else:
                self._log_once(("restore_power_scheme",), "[WARN] Failed to restore the original power scheme.")
                self._write_power_recovery_state(
                    original_scheme=self._original_power_scheme,
                    switched=True,
                    scheme_in_use=getattr(self, "_power_scheme_unverified_in_use", None),
                )
            self._power_scheme_set_unverified = False
            self._power_scheme_unverified_in_use = None
            self._power_plan_active = False
            self._power_scheme_in_use = None
            return
        if self._original_power_scheme and self._power_plan_active:
            expected_active = None
            if self._power_scheme_in_use == "ultimate":
                expected_active = self.ultimate_guid
            elif self._power_scheme_in_use == "high":
                expected_active = self.high_performance_guid
            current = self._get_active_power_scheme()
            if expected_active is not None and current is not None and not self._guids_equal(current, expected_active):
                self._log_once(
                    ("power_external_change", self._power_scheme_in_use),
                    "[INFO] Active power scheme changed externally; preserving the user's current scheme.",
                )
                self._clear_power_recovery_state()
                self._power_plan_active = False
                self._power_scheme_in_use = None
                return
            if not self._set_power_scheme(self._original_power_scheme):
                self._log_once(("restore_power_scheme",), "[WARN] Failed to restore the original power scheme.")
                self._write_power_recovery_state(
                    original_scheme=self._original_power_scheme,
                    switched=True,
                    scheme_in_use=self._power_scheme_in_use,
                )
            else:
                if self._power_scheme_in_use:
                    self._log(f"[INFO] Restored original power scheme. Disabled {self._power_scheme_in_use} performance mode.")
                self._clear_power_recovery_state()
        else:
            self._clear_power_recovery_state()
        self._power_plan_active = False
        self._power_scheme_in_use = None
        self._power_scheme_set_unverified = False
        self._power_scheme_unverified_in_use = None
