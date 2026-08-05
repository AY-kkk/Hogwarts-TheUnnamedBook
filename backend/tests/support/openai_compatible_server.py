from __future__ import annotations

import json
import os
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from dataclasses import field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Iterator


@dataclass
class CompatibleServer:
    base_url: str
    api_key: str
    model: str
    chat_requests: int = 0
    requests: list[str] = field(default_factory=list)


def _handler_for(state: CompatibleServer):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self) -> bool:
            if self.headers.get("Authorization") == f"Bearer {state.api_key}":
                return True
            self._json(
                401,
                {"error": {"message": "Invalid API key", "type": "authentication_error"}},
            )
            return False

        def do_GET(self) -> None:  # noqa: N802 - stdlib handler protocol name
            state.requests.append(f"GET {self.path}")
            if not self._authorized():
                return
            if self.path != "/v1/models":
                self._json(404, {"error": {"message": "Not found"}})
                return
            self._json(
                200,
                {
                    "object": "list",
                    "data": [
                        {
                            "id": state.model,
                            "object": "model",
                            "created": 1,
                            "owned_by": "local-proof",
                        }
                    ],
                },
            )

        def do_POST(self) -> None:  # noqa: N802 - stdlib handler protocol name
            state.requests.append(f"POST {self.path}")
            if not self._authorized():
                return
            if self.path != "/v1/chat/completions":
                self._json(404, {"error": {"message": "Not found"}})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                request = json.loads(self.rfile.read(size))
            except (ValueError, json.JSONDecodeError):
                self._json(400, {"error": {"message": "Invalid JSON"}})
                return
            if request.get("model") != state.model:
                self._json(404, {"error": {"message": "Unknown model"}})
                return
            state.chat_requests += 1
            self._json(
                200,
                {
                    "id": f"chatcmpl-local-{state.chat_requests}",
                    "object": "chat.completion",
                    "created": 1,
                    "model": state.model,
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "Mock provider is ready.",
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 4,
                        "completion_tokens": 5,
                        "total_tokens": 9,
                    },
                },
            )

        def log_message(self, _format: str, *args: object) -> None:
            return

    return Handler


@contextmanager
def openai_compatible_server() -> Iterator[CompatibleServer]:
    state = CompatibleServer(
        base_url="",
        api_key="local-protocol-key",
        model="mock-chat",
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), _handler_for(state))
    state.base_url = f"http://127.0.0.1:{server.server_port}/v1"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def serve_forever(host: str = "127.0.0.1", port: int = 9901) -> None:
    """Run the deterministic provider for local browser demonstrations."""
    state = CompatibleServer(
        base_url=f"http://{host}:{port}/v1",
        api_key=os.getenv("MOCK_MODEL_API_KEY", "local-protocol-key"),
        model=os.getenv("MOCK_MODEL_NAME", "mock-chat"),
    )
    server = ThreadingHTTPServer((host, port), _handler_for(state))
    print(
        f"Local OpenAI-compatible provider listening on {state.base_url} "
        f"with model {state.model}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    serve_forever(
        host=os.getenv("MOCK_MODEL_HOST", "127.0.0.1"),
        port=int(os.getenv("MOCK_MODEL_PORT", "9901")),
    )
