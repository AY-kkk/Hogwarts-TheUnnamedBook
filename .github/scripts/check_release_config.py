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


missing = [name for name in REQUIRED_VALUES if not os.getenv(name, "").strip()]
if missing:
    raise SystemExit(f"Missing protected release configuration: {', '.join(missing)}")

api_url = os.environ["VITE_API_BASE_URL"]
if not api_url.startswith("https://"):
    raise SystemExit("VITE_API_BASE_URL must use HTTPS for staging and production")

print("Protected release configuration is complete")
