"""Protected recovery-state file helpers."""

import base64
import hashlib
import hmac
import json
import os
import secrets
import subprocess
import tempfile


PROTECTED_STATE_VERSION = 2
PROTECTED_STATE_APP_DIR = "EsportsIsolatorPRO"
PROTECTED_STATE_KEY_FILE = "recovery-state.hmac.key"


class ProtectedStateError(ValueError):
    """Raised when protected recovery state cannot be trusted."""


def default_protected_state_dir():
    root = os.environ.get("ProgramData")
    if not root:
        root = os.path.join(os.path.expanduser("~"), "AppData", "Local")
    return os.path.join(root, PROTECTED_STATE_APP_DIR, "Recovery")


def canonical_json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def state_key_path(path):
    return os.path.join(os.path.dirname(os.path.abspath(path)), PROTECTED_STATE_KEY_FILE)


def acl_grants_standard_user_write(acl_text):
    risky_principals = (
        "everyone",
        "authenticated users",
        "builtin\\users",
        "nt authority\\authenticated users",
        "users",
        "s-1-1-0",
        "s-1-5-11",
        "s-1-5-32-545",
    )
    for line in str(acl_text or "").splitlines():
        lower = line.lower()
        if "(deny)" in lower:
            continue
        if not any(principal in lower for principal in risky_principals):
            continue
        rights = []
        start = 0
        while True:
            open_index = lower.find("(", start)
            if open_index < 0:
                break
            close_index = lower.find(")", open_index + 1)
            if close_index < 0:
                break
            rights.append(lower[open_index + 1:close_index])
            start = close_index + 1
        if any(right in {"f", "m", "w", "wd", "ad", "dc", "wo"} for chunk in rights for right in chunk.split(",")):
            return True
    return False


def _run_icacls(args):
    try:
        return subprocess.run(
            ["icacls", *args],
            check=False,
            capture_output=True,
            text=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except OSError as exc:
        return subprocess.CompletedProcess(["icacls", *args], 1, "", str(exc))


def apply_protected_state_acl(path):
    target = os.path.abspath(path)
    if os.name != "nt":
        try:
            os.chmod(target, 0o700 if os.path.isdir(target) else 0o600)
        except OSError:
            pass
        return

    domain = os.environ.get("USERDOMAIN")
    name = os.environ.get("USERNAME")
    user = f"{domain}\\{name}" if domain and name else name
    inherit = "(OI)(CI)" if os.path.isdir(target) else ""
    grants = [
        f"*S-1-5-18:{inherit}(F)",
        f"*S-1-5-32-544:{inherit}(F)",
    ]
    if user:
        grants.append(f"{user}:{inherit}(F)")
    _run_icacls([target, "/inheritance:r", "/grant:r", *grants])
    _run_icacls([target, "/remove:g", "*S-1-1-0", "*S-1-5-11", "*S-1-5-32-545"])


def ensure_protected_state_parent(path):
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    apply_protected_state_acl(directory)
    return directory


def is_protected_state_path_safe(path):
    targets = [os.path.dirname(os.path.abspath(path))]
    if os.path.exists(path):
        targets.append(os.path.abspath(path))
    key_path = state_key_path(path)
    if os.path.exists(key_path):
        targets.append(key_path)

    if os.name != "nt":
        for target in targets:
            try:
                if os.stat(target).st_mode & 0o022:
                    return False
            except OSError:
                return False
        return True

    for target in targets:
        result = _run_icacls([target])
        if result.returncode != 0:
            return False
        if acl_grants_standard_user_write(f"{result.stdout}\n{result.stderr}"):
            return False
    return True


def _write_bytes_atomic(path, data):
    ensure_protected_state_parent(path)
    fd, tmp = tempfile.mkstemp(prefix=f".{os.path.basename(path)}.", suffix=".tmp", dir=os.path.dirname(os.path.abspath(path)))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        apply_protected_state_acl(path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def _load_or_create_key(path):
    key_path = state_key_path(path)
    if os.path.exists(key_path):
        try:
            with open(key_path, "rb") as handle:
                key = base64.b64decode(handle.read(), validate=True)
        except Exception as exc:
            raise ProtectedStateError("tampered recovery state key") from exc
        if len(key) != 32:
            raise ProtectedStateError("tampered recovery state key")
        return key

    key = secrets.token_bytes(32)
    _write_bytes_atomic(key_path, base64.b64encode(key))
    return key


def _load_existing_key(path):
    key_path = state_key_path(path)
    if not os.path.exists(key_path):
        raise ProtectedStateError("tampered recovery state: missing key")
    return _load_or_create_key(path)


def _signed_body(payload):
    return {"version": PROTECTED_STATE_VERSION, "payload": payload}


def _tag_for(key, body):
    return "sha256:" + hmac.new(key, canonical_json_bytes(body), hashlib.sha256).hexdigest()


def write_protected_state_file(path, payload):
    if not isinstance(payload, dict):
        raise ProtectedStateError("protected recovery state payload must be an object")
    key = _load_or_create_key(path)
    body = _signed_body(payload)
    envelope = {**body, "tag": _tag_for(key, body)}
    _write_bytes_atomic(path, canonical_json_bytes(envelope) + b"\n")
    return True


def read_protected_state_file(path):
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            envelope = json.load(handle)
    except Exception as exc:
        raise ProtectedStateError("invalid protected recovery state") from exc
    if not isinstance(envelope, dict) or envelope.get("version") != PROTECTED_STATE_VERSION:
        raise ProtectedStateError("tampered or downgraded recovery state")
    payload = envelope.get("payload")
    tag = envelope.get("tag")
    if not isinstance(payload, dict) or not isinstance(tag, str):
        raise ProtectedStateError("invalid protected recovery state envelope")
    key = _load_existing_key(path)
    expected = _tag_for(key, _signed_body(payload))
    if not hmac.compare_digest(tag, expected):
        raise ProtectedStateError("tampered recovery state")
    return payload


def remove_protected_state_file(path):
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
