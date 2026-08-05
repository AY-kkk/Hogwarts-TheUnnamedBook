from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable
from urllib.parse import urlsplit, urlunsplit


class EndpointPolicyError(ValueError):
    """Raised when a provider endpoint violates the outbound request policy."""


AddressResolver = Callable[[str], list[str]]


def _resolve_addresses(hostname: str) -> list[str]:
    try:
        return sorted(
            {
                result[4][0]
                for result in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
            }
        )
    except socket.gaierror as exc:
        raise EndpointPolicyError("provider hostname could not be resolved") from exc


def _is_non_public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    return not ip.is_global


def provider_url_uses_non_public_address(
    url: str,
    *,
    address_resolver: AddressResolver | None = None,
) -> bool:
    hostname = urlsplit(url).hostname
    if not hostname:
        raise EndpointPolicyError("provider URL must include a hostname")
    resolver = address_resolver or _resolve_addresses
    addresses = resolver(hostname)
    return any(_is_non_public(address) for address in addresses)


def validate_provider_url(
    url: str,
    app_env: str,
    allow_private: bool,
    *,
    address_resolver: AddressResolver | None = None,
) -> str:
    try:
        parsed = urlsplit(url.strip())
        port = parsed.port
    except ValueError as exc:
        raise EndpointPolicyError("provider URL is invalid") from exc

    if parsed.scheme not in {"http", "https"} or not parsed.hostname or not parsed.netloc:
        raise EndpointPolicyError("provider URL must be an absolute HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None:
        raise EndpointPolicyError("provider URL cannot contain credentials")
    if parsed.query or parsed.fragment:
        raise EndpointPolicyError("provider URL cannot contain a query string or fragment")
    if app_env == "production" and parsed.scheme != "https":
        raise EndpointPolicyError("provider URL must use HTTPS in production")
    if port is not None and not 1 <= port <= 65535:
        raise EndpointPolicyError("provider URL port is invalid")

    resolver = address_resolver or _resolve_addresses
    try:
        addresses = resolver(parsed.hostname)
    except EndpointPolicyError:
        raise
    except (OSError, ValueError) as exc:
        raise EndpointPolicyError("provider hostname could not be resolved") from exc
    if not addresses:
        raise EndpointPolicyError("provider hostname did not resolve to an address")

    non_public = []
    try:
        non_public = [address for address in addresses if _is_non_public(address)]
    except ValueError as exc:
        raise EndpointPolicyError("provider hostname resolved to an invalid address") from exc
    if non_public and (app_env == "production" or not allow_private):
        raise EndpointPolicyError("provider hostname resolves to a private or non-public address")

    normalized_path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme, parsed.netloc, normalized_path, "", ""))
