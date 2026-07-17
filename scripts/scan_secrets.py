from __future__ import annotations

from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    "OpenAI-style API key": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "client-exposed model key": re.compile(r"\bVITE_(?:OPENAI|ANTHROPIC)_API_KEY\b"),
}
TEXT_SUFFIXES = {
    "", ".css", ".env", ".example", ".html", ".js", ".json", ".md", ".py", ".sh",
    ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml",
}


def tracked_files() -> list[Path]:
    output = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    )
    return [ROOT / name.decode("utf-8") for name in output.split(b"\0") if name]


def candidate_files() -> list[Path]:
    files = tracked_files()
    dist = ROOT / "hogwarts-frontend" / "dist"
    if dist.exists():
        files.extend(path for path in dist.rglob("*") if path.is_file())
    return files


def main() -> None:
    findings: list[str] = []
    for path in candidate_files():
        if path.suffix.lower() not in TEXT_SUFFIXES or path.stat().st_size > 5_000_000:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in PATTERNS.items():
            if pattern.search(content):
                findings.append(f"{path.relative_to(ROOT)}: {label}")
    if findings:
        raise SystemExit("Potential secret exposure detected:\n" + "\n".join(sorted(findings)))
    print("Secret scan passed for tracked sources and production bundle")


if __name__ == "__main__":
    main()
