#!/usr/bin/env python3
"""
Minimal local HTTP server for the debate board.
Summarization has been removed; reserved for future KI moderation.
"""
import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Max-Age", "86400")
    handler.end_headers()
    handler.wfile.write(data)


def _options_response(handler: BaseHTTPRequestHandler) -> None:
    handler.send_response(204)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Max-Age", "86400")
    handler.end_headers()


class Handler(BaseHTTPRequestHandler):
    server_version = "DebateBoardProxy/1.0"

    def do_OPTIONS(self) -> None:
        _options_response(self)

    def do_GET(self) -> None:
        if self.path == "/" or self.path == "/health":
            _json_response(self, 200, {"status": "ok"})
            return
        _json_response(self, 404, {"error": "not_found"})

    def do_POST(self) -> None:
        _json_response(self, 404, {"error": "not_found"})

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))


def main() -> int:
    p = argparse.ArgumentParser(description="Local proxy for debate board (moderation placeholder).")
    p.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    p.add_argument("--port", default=8000, type=int, help="Bind port (default: 8000)")
    args = p.parse_args()

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Proxy listening on http://{args.host}:{args.port}/")
    print("Stop with Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        httpd.server_close()


if __name__ == "__main__":
    raise SystemExit(main())
