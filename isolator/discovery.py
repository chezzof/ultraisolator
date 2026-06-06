"""DiscoveryMixin implementation slice."""

from .winapi import *

# WHY: Module-level constants — SPI-derived names hit _is_game_name_normalized
# hundreds of times per poll; avoid per-call set literals and re-normalization.
_LAUNCHER_EXES = frozenset({
    "epicwebhelper.exe",
    "epicgameslauncher.exe",
    "steam.exe",
    "steamwebhelper.exe",
    "eadesktop.exe",
    # WHY: BattlEye DRM wrapper. Spawns the real game and exits ~30s later.
    # Was being auto-detected as a game itself via Steam library scan, causing
    # double Game Mode entry/exit cycles and stray IFEO writes.
    "start_protected_game.exe",
})
_PROTECTED_GAME_TITLES = frozenset({
    "valorant.exe",
    "fortniteclient-win64-shipping.exe",
    "rainbowsix.exe",
})
_PROTECTED_TITLE_TOKENS = ("easyanticheat", "battleye", "beservice", "vgc", "vgtray")


class DiscoveryMixin:
    def _app_profile_for_name(self, name):
        normalized = name if name and "\\" not in str(name) and "/" not in str(name) else self._normalize_name(name)
        profile = getattr(self, "app_profiles", {}).get(normalized)
        if profile and profile.get("enabled", True):
            return profile
        return None

    def _profile_treats_as_game(self, normalized):
        profile = self._app_profile_for_name(normalized)
        if not profile or not profile.get("treat_as_game"):
            return False
        return not self._is_protected_process_name(normalized)

    def _profile_never_jail(self, normalized):
        profile = self._app_profile_for_name(normalized)
        return bool(profile and profile.get("never_jail"))

    def _profile_always_jail(self, normalized):
        profile = self._app_profile_for_name(normalized)
        return bool(profile and profile.get("always_jail"))

    def _profile_priority_class(self, normalized):
        profile = self._app_profile_for_name(normalized)
        if not profile:
            return ""
        return str(profile.get("priority_class", "") or "")

    def _is_game_name_normalized(self, normalized):
        if not normalized or normalized in _LAUNCHER_EXES:
            return False
        if self._profile_treats_as_game(normalized):
            return True
        if normalized in self.games:
            return True
        if self.auto_detect_steam and normalized in self._steam_games_cache:
            return True
        if self.auto_detect_epic and normalized in self._epic_games_cache:
            return True
        return False

    def _is_game_name(self, name):
        return self._is_game_name_normalized(self._normalize_name(name))

    def _normalize_spi_name(self, name):
        return name.lower() if name else ""

    def _is_protected_process_name(self, name):
        normalized = self._normalize_name(name)
        if not normalized:
            return True
        if normalized in self._protected_cache:
            return self._protected_cache[normalized]
        if normalized in self.protected_exact:
            self._protected_cache[normalized] = True
            return True
        is_protected = normalized.startswith(self.protected_prefixes)
        self._protected_cache[normalized] = is_protected
        return is_protected

    def _get_processes(self):
        # WHY: Reuse a pre-allocated wintypes.ULONG for the buffer_size parameter
        # instead of creating a new one each call. This avoids allocating a ctypes
        # wrapper object on every poll cycle (every 2s during game mode).
        buffer_size = self._spi_buffer_size
        buffer_size.value = ctypes.sizeof(self._spi_buffer)
        max_spi_retries = 10
        max_spi_buffer_size = 256 * 1024 * 1024
        attempts = 0
        while attempts < max_spi_retries:
            status = ntdll.NtQuerySystemInformation(5, self._spi_buffer, buffer_size, ctypes.byref(buffer_size))
            if status == STATUS_INFO_LENGTH_MISMATCH:
                new_size = max(buffer_size.value, ctypes.sizeof(self._spi_buffer)) + (1024 * 1024)
                if new_size > max_spi_buffer_size:
                    self._log_once(("spi_buffer_overflow",), "[ERROR] Process enumeration buffer exceeded 256MB limit.")
                    return []
                self._spi_buffer = ctypes.create_string_buffer(new_size)
                buffer_size.value = new_size
                attempts += 1
                continue
            if not nt_success(status):
                self._log_once(("nt_query_system_information", int(status)), f"[WARN] NtQuerySystemInformation failed: 0x{ctypes.c_ulong(status).value:08X}")
                return []
            break
        else:
            self._log_once(("spi_max_retries",), "[ERROR] Process enumeration exceeded maximum retry attempts.")
            return []

        # WHY: Use struct.unpack_from to read fields directly from the ctypes
        # buffer via the C buffer protocol — TRUE ZERO-COPY. The previous
        # approach used self._spi_buffer.raw which copies the ENTIRE buffer
        # (1MB+) into a temporary Python bytes object on every poll cycle.
        # That single .raw call was allocating 1MB of immediate garbage every
        # 2 seconds during game mode — the exact kind of memory churn that
        # triggers GC pauses and frame-time spikes. struct.unpack_from reads
        # directly from the buffer's C memory without any Python-side copy.
        # Measured: 218μs wasted per cycle for .raw → eliminated completely.
        spi_buf = self._spi_buffer
        buf_len = buffer_size.value
        off_next = self._spi_off_next
        off_pid = self._spi_off_pid
        off_name = self._spi_off_name
        off_create_time = self._spi_off_create_time
        ptr_size = self._spi_ptr_size
        fmt_ulong = self._spi_struct_ulong.unpack_from
        fmt_ushort = self._spi_struct_ushort.unpack_from
        fmt_longlong = self._spi_struct_longlong.unpack_from
        fmt_ptr = self._spi_struct_ptr.unpack_from
        # WHY: UNICODE_STRING layout is { USHORT Length, USHORT MaxLength, LPWSTR Buffer }.
        # Length is at off_name+0 (2 bytes), Buffer pointer is at off_name+8 on x64
        # (off_name+4 on x86). We read Length to know how many WCHARs to extract.
        name_len_offset = off_name  # USHORT Length at start of UNICODE_STRING
        name_buf_offset = off_name + (8 if ptr_size == 8 else 4)  # LPWSTR Buffer
        normalize = self._normalize_spi_name
        processes = []
        process_create_times = {}
        processes_append = processes.append
        offset = 0
        while offset < buf_len:
            # WHY: struct.unpack_from reads directly from the ctypes buffer's
            # C memory via the buffer protocol. No Python bytes object is created.
            # [0] extracts the single value from the returned tuple.
            next_entry = fmt_ulong(spi_buf, offset + off_next)[0]
            pid = fmt_ptr(spi_buf, offset + off_pid)[0]
            create_time = fmt_longlong(spi_buf, offset + off_create_time)[0]
            name_length = fmt_ushort(spi_buf, offset + name_len_offset)[0]
            name = ""
            if name_length > 0:
                name_ptr = fmt_ptr(spi_buf, offset + name_buf_offset)[0]
                if name_ptr:
                    try:
                        name = ctypes.wstring_at(name_ptr, name_length // 2)
                    except Exception:
                        name = ""
            if pid:
                process_create_times[int(pid)] = int(create_time)
            processes_append((pid, normalize(name)))
            if next_entry == 0:
                break
            offset += next_entry
        self._process_create_times = process_create_times

        # WHY: Shrink the buffer AFTER parsing, not before. The old buffer holds
        # the NtQuerySystemInformation results; replacing it before the parsing
        # loop would cause the loop to read from a new, empty buffer — returning
        # zero processes and triggering false "all games closed" events that
        # thrash process priorities and cause micro-stutters.
        # WHY: Skip buffer shrink when GC is disabled (during game mode).
        # Replacing the buffer creates a 1-4MB garbage object that won't be
        # collected until the next gc.collect() — contributing to the memory
        # buildup that makes those periodic collections expensive and stuttery.
        actual_used = buffer_size.value
        current_size = ctypes.sizeof(self._spi_buffer)
        if current_size > 4 * 1024 * 1024 and actual_used < current_size // 4 and gc.isenabled():
            self._spi_buffer = ctypes.create_string_buffer(max(1024 * 1024, actual_used * 2))

        return processes

    def _get_process_create_time(self, handle):
        creation_time = wintypes.FILETIME()
        exit_time = wintypes.FILETIME()
        kernel_time = wintypes.FILETIME()
        user_time = wintypes.FILETIME()
        if kernel32.GetProcessTimes(handle, ctypes.byref(creation_time), ctypes.byref(exit_time), ctypes.byref(kernel_time), ctypes.byref(user_time)):
            return self._filetime_to_int(creation_time)
        return 0

    def _get_process_name(self, pid):
        handle = self._open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION, quiet=True)
        if not handle:
            return ""
        try:
            buffer = ctypes.create_unicode_buffer(32768)
            size = wintypes.DWORD(len(buffer))
            if kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
                return self._normalize_name(buffer.value)
        finally:
            kernel32.CloseHandle(handle)
        return ""

    def _get_process_full_path(self, pid):
        handle = self._open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION, quiet=True)
        if not handle:
            return ""
        try:
            buffer = ctypes.create_unicode_buffer(32768)
            size = wintypes.DWORD(len(buffer))
            if kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
                return buffer.value
        finally:
            kernel32.CloseHandle(handle)
        return ""

    def _is_wow64_process(self, handle):
        result = wintypes.BOOL()
        return bool(kernel32.IsWow64Process(handle, ctypes.byref(result)) and result.value)

    def _get_steam_path(self):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as key:
                steam_path = winreg.QueryValueEx(key, "SteamPath")[0]
                return steam_path.replace("/", "\\")
        except Exception:
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam") as key:
                    steam_path = winreg.QueryValueEx(key, "InstallPath")[0]
                    return steam_path
            except Exception:
                return None

    def _scan_steam_games(self, force=False):
        now = time.monotonic()
        if not force and (now - self._last_steam_scan) < 300:
            return
        self._last_steam_scan = now
        steam_path = self._get_steam_path()
        if not steam_path:
            self._note_capability("Steam not found in registry — Steam auto-detection disabled.")
            self.auto_detect_steam = False
            return
        library_paths = list(self.steam_library_paths) if self.steam_library_paths else [os.path.join(steam_path, "steamapps", "common")]
        vdf_path = os.path.join(steam_path, "steamapps", "libraryfolders.vdf")
        if os.path.exists(vdf_path):
            try:
                with open(vdf_path, "r", encoding="utf-8") as f:
                    for p in re.findall(r'"path"\s+"([^"]+)"', f.read()):
                        p = p.replace("\\\\", "\\")
                        common = os.path.join(p, "steamapps", "common")
                        if os.path.exists(common) and common not in library_paths:
                            library_paths.append(common)
            except Exception:
                pass
        steam_games = set()
        for lib in library_paths:
            if not os.path.exists(lib):
                continue
            try:
                for game_dir in os.listdir(lib):
                    game_path = os.path.join(lib, game_dir)
                    if not os.path.isdir(game_path):
                        continue
                    # WHY: Walk up to 3 levels deep to find actual game .exe files.
                    # Steam games typically have their .exe buried 1-3 levels under
                    # steamapps/common/GameName/. Only scanning level 1 misses most.
                    self._scan_for_game_exes(game_path, steam_games, max_depth=3)
            except Exception:
                continue
        self._steam_games_cache = steam_games

    @staticmethod
    def _looks_like_game_exe(exe_name, exe_full_path=None):
        # WHY: Filter out redistributables, installers, crash handlers, and
        # anti-cheat utility exes that live under Steam / Epic library trees.
        # Without this filter every vcredist_x64.exe and UnityCrashHandler.exe
        # in steamapps/common/<game>/_CommonRedist/ would be treated as a game.
        if not exe_name:
            return False
        lowered = exe_name.lower()
        if not lowered.endswith(".exe"):
            return False
        if NON_GAME_EXE_NAME_PATTERN.match(lowered):
            return False
        if exe_full_path:
            normalized_path = exe_full_path.lower().replace("/", "\\")
            for token in NON_GAME_PATH_TOKENS:
                if token in normalized_path:
                    return False
        return True

    def _scan_for_game_exes(self, root_path, out_set, max_depth=3):
        # WHY: Pre-prune `dirs` so os.walk skips redistributable / installer
        # subtrees AND so depth-(max_depth+1) directories are never entered
        # in the first place. The previous implementation called _dirs.clear()
        # AFTER already walking depth-(max_depth+1), wasting filesystem I/O.
        for current_root, dirs, files in os.walk(root_path):
            rel = os.path.relpath(current_root, root_path)
            depth = 0 if rel in (".", "") else rel.count(os.sep) + 1
            if depth >= max_depth:
                dirs[:] = []
            else:
                # WHY: Substring match (not exact equality) so dirs named
                # "Game Installers" or "_CommonRedist_x86" are also pruned.
                dirs[:] = [
                    d for d in dirs
                    if not any(tok in d.lower() for tok in NON_GAME_DIR_PRUNE_TOKENS)
                ]
            for f in files:
                if self._looks_like_game_exe(f, os.path.join(current_root, f)):
                    out_set.add(f.lower())

    def _is_steam_game(self, exe_path):
        if not self.auto_detect_steam or not exe_path:
            return False
        p = exe_path.lower().replace("/", "\\")
        if not self._looks_like_game_exe(os.path.basename(p), p):
            return False
        if "\\steamapps\\common\\" in p:
            return True
        return os.path.basename(p) in self._steam_games_cache

    def _get_epic_path(self):
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Epic Games\EpicGamesLauncher") as key:
                return os.path.dirname(winreg.QueryValueEx(key, "AppDataPath")[0])
        except Exception:
            return r"C:\Program Files\Epic Games" if os.path.exists(r"C:\Program Files\Epic Games") else None

    def _scan_epic_games(self, force=False):
        now = time.monotonic()
        if not force and (now - self._last_epic_scan) < 300:
            return
        self._last_epic_scan = now
        base = self._get_epic_path()
        paths = list(self.epic_library_paths) if self.epic_library_paths else ([base] if base and os.path.exists(base) else [])
        if os.path.exists(r"C:\Program Files\Epic Games") and r"C:\Program Files\Epic Games" not in paths:
            paths.append(r"C:\Program Files\Epic Games")
        epic_games = set()
        for lib in paths:
            if not os.path.exists(lib):
                continue
            try:
                for game_dir in os.listdir(lib):
                    game_path = os.path.join(lib, game_dir)
                    if not os.path.isdir(game_path):
                        continue
                    # WHY: Walk up to 3 levels deep, same approach as Steam scan.
                    self._scan_for_game_exes(game_path, epic_games, max_depth=3)
            except Exception:
                continue
        self._epic_games_cache = epic_games

    def _is_epic_game(self, exe_path):
        if not self.auto_detect_epic or not exe_path:
            return False
        p = exe_path.lower().replace("/", "\\")
        if not self._looks_like_game_exe(os.path.basename(p), p):
            return False
        if "\\epic games\\" in p:
            return True
        return os.path.basename(p) in self._epic_games_cache

    def _detect_protected_title(self, name):
        normalized = self._normalize_name(name)
        if not normalized:
            return False
        return normalized in _PROTECTED_GAME_TITLES or any(
            token in normalized for token in _PROTECTED_TITLE_TOKENS
        )
