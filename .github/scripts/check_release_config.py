import os


REQUIRED_VALUES = (
    "VITE_API_BASE_URL",
    "VITE_OPERATOR_NAME",
    "VITE_PRIVACY_CONTACT",
    "VITE_MODEL_DATA_DESTINATIONS",
    "VITE_MINIMUM_AGE",
    "IP_AUTHORIZATION_REFERENCE",
    "LEGAL_REVIEW_REFERENCE",
    "RELEASE_ONCALL_OWNER",
    "VERCEL_ORG_ID",
    "VERCEL_PROJECT_ID",
)



def validate_release_config(environment: dict[str, str]) -> None:
    missing = [name for name in REQUIRED_VALUES if not environment.get(name, "").strip()]
    if missing:
        raise ValueError(f"Missing protected release configuration: {', '.join(missing)}")

    api_url = environment["VITE_API_BASE_URL"]
    if not api_url.startswith("https://") or "localhost" in api_url or "127.0.0.1" in api_url:
        raise ValueError("VITE_API_BASE_URL must use a non-local HTTPS endpoint")

    contact = environment["VITE_PRIVACY_CONTACT"]
    if "@" not in contact or contact.startswith("@") or contact.endswith("@"):
        raise ValueError("VITE_PRIVACY_CONTACT must be a valid contact email")

    try:
        minimum_age = int(environment["VITE_MINIMUM_AGE"])
    except ValueError as exc:
        raise ValueError("VITE_MINIMUM_AGE must be an integer") from exc
    if not 13 <= minimum_age <= 18:
        raise ValueError("VITE_MINIMUM_AGE must be between 13 and 18")


if __name__ == "__main__":
    try:
        validate_release_config(dict(os.environ))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    print("Protected release configuration is complete")
