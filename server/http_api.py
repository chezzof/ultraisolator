"""Small stdlib HTTP API for single-user localhost access."""

import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .bridge import AdministratorRequired, BridgeConflict
from .config_store import ConfigError


_GET_ROUTES = {"/status", "/api/status"}
_LIVE_ROUTES = {"/live", "/api/live"}
_TOPOLOGY_ROUTES = {"/topology", "/api/topology"}
_ANALYSIS_ROUTES = {"/analysis", "/api/analysis"}
_READINESS_ROUTES = {"/readiness", "/api/readiness"}
_MSI_ROUTES = {"/msi", "/api/msi"}
_CONFIG_ROUTES = {"/config", "/api/config"}
_CONFIG_DEFAULTS_ROUTES = {"/config/defaults", "/api/config/defaults"}
_LOG_ROUTES = {"/logs", "/api/logs"}
_POST_START_ROUTES = {"/start", "/api/start"}
_POST_STOP_ROUTES = {"/stop", "/api/stop"}
_POST_RECOVER_ROUTES = {"/recover", "/api/recover"}
_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
_MAX_BODY_BYTES = 64 * 1024


class LocalhostThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def _is_loopback_host(host):
    return host in _LOOPBACK_HOSTS


def _allowed_cors_origin(origin):
    if not origin:
        return None
    # FIX 7: do NOT reflect "null"/"file://" origins — sandboxed iframes send
    # Origin: null and could otherwise read responses cross-origin. The Electron
    # renderer loads via file:// but its fetches target http://127.0.0.1 (a
    # genuine loopback http origin), so only loopback http(s) origins are allowed.
    try:
        parsed = urlparse(origin)
        hostname = parsed.hostname
    except ValueError:
        return None
    if parsed.scheme in {"http", "https"} and _is_loopback_host(hostname):
        return origin
    return None


def create_server(address, handler_class):
    host, _port = address
    if not _is_loopback_host(host):
        raise ValueError("API server must bind to localhost, 127.0.0.1, or ::1.")
    return LocalhostThreadingHTTPServer(address, handler_class)


def create_handler(bridge, api_token=None):
    expected_token = str(api_token or "")

    class IsolatorApiHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, _format, *_args):
            return

        def _send_cors_headers(self):
            origin = _allowed_cors_origin(self.headers.get("Origin"))
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Isolator-Token")

        def _send_json(self, status_code, payload):
            body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self._send_cors_headers()
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            self.close_connection = True

        def _send_sse_headers(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.send_header("X-Accel-Buffering", "no")
            self._send_cors_headers()
            self.end_headers()

        def _write_sse_event(self, event_name, payload):
            data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
            frame = f"event: {event_name}\ndata: {data}\n\n".encode("utf-8")
            self.wfile.write(frame)
            self.wfile.flush()

        def _origin_is_cross_site(self):
            # FIX 6: CSRF guard for state-changing routes. A request carrying an
            # Origin header that is NOT an allowed loopback origin is rejected.
            # Requests with no Origin (Electron app, tests, curl) are permitted.
            origin = self.headers.get("Origin")
            if not origin:
                return False
            return _allowed_cors_origin(origin) is None

        def _request_is_authorized(self):
            if not expected_token:
                return True
            auth = self.headers.get("Authorization", "")
            if auth.startswith("Bearer ") and secrets.compare_digest(auth[7:], expected_token):
                return True
            token = self.headers.get("X-Isolator-Token", "")
            return bool(token) and secrets.compare_digest(token, expected_token)

        def _reject_unsafe_request(self):
            if self._origin_is_cross_site():
                self._send_json(403, {"ok": False, "error": "forbidden_origin"})
                return True
            if not self._request_is_authorized():
                self._send_json(401, {"ok": False, "error": "unauthorized"})
                return True
            return False

        def _content_length(self):
            try:
                return int(self.headers.get("Content-Length", "0") or "0")
            except ValueError:
                return 0

        def _body_too_large(self):
            if self._content_length() > _MAX_BODY_BYTES:
                self._send_json(413, {"ok": False, "error": "body_too_large"})
                return True
            return False

        def _stream_live(self, once=False):
            self._send_sse_headers()
            stream_cancel = threading.Event()
            # live_client() decrements the counter in its finally clause; the
            # try/finally guarantees that runs even if the engine raises here.
            with bridge.live_client():
                try:
                    while True:
                        snapshot = bridge.live_snapshot()
                        self._write_sse_event("snapshot", snapshot)
                        for notification in bridge.notifications_for_snapshot(snapshot):
                            self._write_sse_event("notification", notification)
                        if once:
                            break
                        stream_cancel.wait(bridge.live_interval_seconds(snapshot))
                except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, TimeoutError):
                    # Client disconnected — propagate so do_GET stays quiet.
                    raise
                except Exception:
                    # FIX 2: an engine exception mid-stream must not kill the
                    # worker thread after headers are sent; log once and end the
                    # stream cleanly so the live_client counter is released.
                    self.log_error("live stream ended after engine error")
            self.close_connection = True

        def _discard_body(self):
            length = self._content_length()
            if length > 0:
                self.rfile.read(length)

        def _read_json_body(self):
            length = self._content_length()
            if length <= 0:
                return {}
            raw = self.rfile.read(length)
            try:
                return json.loads(
                    raw.decode("utf-8"),
                    parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Invalid numeric constant: {value}")),
                )
            except (UnicodeDecodeError, ValueError, json.JSONDecodeError):
                raise ConfigError([{"field": "$", "message": "Request body must be valid JSON."}])

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self._send_cors_headers()
            self.end_headers()
            self.close_connection = True

        def do_GET(self):
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            if self._reject_unsafe_request():
                return
            # FIX 1: mirror do_POST's error handling so an engine exception or a
            # malformed config.json (JSONDecodeError) surfaces as a clean JSON
            # response instead of a dropped connection. ConfigError -> 400.
            try:
                if path in _GET_ROUTES:
                    self._send_json(200, bridge.status())
                    return
                if path in _CONFIG_DEFAULTS_ROUTES:
                    self._send_json(200, bridge.get_config_defaults())
                    return
                if path in _CONFIG_ROUTES:
                    self._send_json(200, bridge.get_config())
                    return
                if path in _TOPOLOGY_ROUTES:
                    query = parse_qs(parsed.query)
                    refresh = query.get("refresh", ["0"])[0] == "1"
                    self._send_json(200, bridge.topology(refresh=refresh))
                    return
                if path in _ANALYSIS_ROUTES:
                    self._send_json(200, bridge.analysis())
                    return
                if path in _READINESS_ROUTES:
                    query = parse_qs(parsed.query)
                    refresh = query.get("refresh", ["0"])[0] == "1"
                    self._send_json(200, bridge.readiness(refresh=refresh))
                    return
                if path in _MSI_ROUTES:
                    query = parse_qs(parsed.query)
                    refresh = query.get("refresh", ["0"])[0] == "1"
                    self._send_json(200, bridge.msi_devices(refresh=refresh))
                    return
                if path in _LOG_ROUTES:
                    query = parse_qs(parsed.query)
                    self._send_json(200, bridge.logs(limit=query.get("limit", ["500"])[0]))
                    return
                if path in _LIVE_ROUTES:
                    query = parse_qs(parsed.query)
                    self._stream_live(once=query.get("once", ["0"])[0] == "1")
                    return
                self._send_json(404, {"ok": False, "error": "not_found"})
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, TimeoutError):
                # Client disconnected (e.g. closed SSE stream) — no response.
                self.close_connection = True
            except ConfigError as exc:
                self._send_json(400, {"ok": False, "error": "invalid_config", "errors": exc.errors})
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": type(exc).__name__})

        def do_POST(self):
            path = urlparse(self.path).path.rstrip("/") or "/"
            if self._reject_unsafe_request() or self._body_too_large():
                return
            self._discard_body()
            try:
                if path in _POST_START_ROUTES:
                    self._send_json(200, bridge.start())
                elif path in _POST_STOP_ROUTES:
                    self._send_json(200, bridge.stop())
                elif path in _POST_RECOVER_ROUTES:
                    self._send_json(200, bridge.recover())
                else:
                    self._send_json(404, {"ok": False, "error": "not_found"})
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, TimeoutError):
                self.close_connection = True
            except BridgeConflict as exc:
                self._send_json(409, {"ok": False, "error": str(exc)})
            except AdministratorRequired:
                self._send_json(403, {"error": "administrator_required"})
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": type(exc).__name__})

        def do_PUT(self):
            path = urlparse(self.path).path.rstrip("/") or "/"
            if self._reject_unsafe_request() or self._body_too_large():
                return
            if path not in _CONFIG_ROUTES:
                self._discard_body()
                self._send_json(404, {"ok": False, "error": "not_found"})
                return
            try:
                payload = self._read_json_body()
                if isinstance(payload, dict) and "config" in payload and len(payload) == 1:
                    payload = payload["config"]
                self._send_json(200, bridge.update_config(payload))
            except ConfigError as exc:
                self._send_json(400, {"ok": False, "error": "invalid_config", "errors": exc.errors})
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": type(exc).__name__})

    return IsolatorApiHandler
