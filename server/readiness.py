"""Read-only competitive gaming readiness checklist."""


def _check(check_id, label, status, detail, recommendation=None):
    return {
        "id": check_id,
        "label": label,
        "status": status,
        "detail": detail,
        "recommendation": recommendation,
    }


def build_readiness_payload(status, topology, config, cache_hit=False, generated_at=None, cache_ttl_s=300):
    status = dict(status or {})
    topology = dict(topology or {})
    config = dict(config or {})

    if status.get("game_mode"):
        return {
            "ok": True,
            "available": False,
            "reason": "paused_in_game_mode",
            "summary": {"ok": 0, "warning": 0, "error": 0, "total": 0},
            "checks": [],
            "cache": {
                "hit": bool(cache_hit),
                "ttl_s": int(cache_ttl_s),
                "generated_at": generated_at,
            },
        }

    checks = [
        _check(
            "admin",
            "Administrator rights",
            "ok" if status.get("admin") else "error",
            "System-level tuning permissions are available." if status.get("admin") else "Run the app as Administrator.",
            None if status.get("admin") else "Restart the desktop app elevated.",
        ),
        _check(
            "power_plan",
            "Power plan",
            "ok" if status.get("power_plan_active") else "warning",
            status.get("power_scheme_in_use") or "Performance power plan is not currently active.",
            None if status.get("power_plan_active") else "Start the engine and keep power scheme switching enabled.",
        ),
        _check(
            "timer_resolution",
            "Timer resolution",
            "ok" if status.get("timer_resolution_applied") else "warning",
            "Timer resolution is applied." if status.get("timer_resolution_applied") else "Timer resolution has not been applied.",
            None if status.get("timer_resolution_applied") else "Keep disable_timer_resolution_tweak set to false.",
        ),
        _check(
            "background_jailing",
            "Background jailing",
            "ok" if config.get("enable_background_jailing") else "warning",
            "Background jailing is enabled." if config.get("enable_background_jailing") else "Background jailing is disabled.",
            None if config.get("enable_background_jailing") else "Enable background jailing when you want strict isolation.",
        ),
        _check(
            "ifeo_priority",
            "IFEO priority",
            "ok" if not config.get("disable_game_priority_boost") else "warning",
            "Game priority and IFEO boost are enabled." if not config.get("disable_game_priority_boost") else "Game priority and IFEO boost are disabled.",
            None if not config.get("disable_game_priority_boost") else "Set disable_game_priority_boost to false unless anti-cheat testing requires it.",
        ),
        _check(
            "topology",
            "CPU topology",
            "ok" if topology.get("available") else "warning",
            _topology_detail(topology),
            None if topology.get("available") else "Start the engine to populate CPU topology.",
        ),
        _check(
            "recovery",
            "Recovery state",
            "ok" if not status.get("persistent_recovery_incomplete") and not status.get("reported_failure_count") else "error",
            "No recovery backlog is reported." if not status.get("persistent_recovery_incomplete") and not status.get("reported_failure_count") else "Recovery backlog or restore failures are present.",
            None if not status.get("persistent_recovery_incomplete") and not status.get("reported_failure_count") else "Run recovery before starting a match.",
        ),
        _check(
            "capability_notes",
            "Capability warnings",
            "ok" if not status.get("capability_notes") else "warning",
            "No capability warnings are reported." if not status.get("capability_notes") else str(status.get("capability_notes")[0]),
            None if not status.get("capability_notes") else "Open logs and review capability warnings.",
        ),
    ]
    summary = {
        "ok": sum(1 for check in checks if check["status"] == "ok"),
        "warning": sum(1 for check in checks if check["status"] == "warning"),
        "error": sum(1 for check in checks if check["status"] == "error"),
        "total": len(checks),
    }
    return {
        "ok": True,
        "available": True,
        "reason": None,
        "summary": summary,
        "checks": checks,
        "cache": {
            "hit": bool(cache_hit),
            "ttl_s": int(cache_ttl_s),
            "generated_at": generated_at,
        },
    }


def _topology_detail(topology):
    if not topology.get("available"):
        return "CPU topology is not available."
    summary = topology.get("summary", {}) if isinstance(topology, dict) else {}
    cores = summary.get("core_count", 0) or 0
    logical = summary.get("logical_processor_count", 0) or 0
    return f"{cores} cores / {logical} logical processors mapped."
