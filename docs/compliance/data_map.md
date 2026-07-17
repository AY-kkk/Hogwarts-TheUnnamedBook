# Public MVP data map

- Status: P0 implementation baseline
- Updated: 2026-07-17
- Owner: TBD (Privacy / Security)

## Data flows

| Data category | Examples | Source | Storage / recipient | Purpose | Default retention | User control |
|---|---|---|---|---|---|---|
| Character profile | Name, gender, blood status, era, trait, wand preference, patronus, self-description | User | Browser IndexedDB | Create and personalize the game | Until local deletion | Export, delete |
| Game state | HP, MP, gold, attributes, inventory, spells, relationships, location, time | Game and AI state update | Browser IndexedDB | Rules, continuity and UI | Until local deletion | Export, delete |
| Story logs | User actions, AI narrative, chapter titles | User and model | Browser IndexedDB | Display and resume story | Until local deletion | Export, delete |
| World line | Events changed by the player | Game engine | Browser IndexedDB | Preserve consequences | Until local deletion | Export, delete |
| Consent record | Policy version, timestamp, operator and model destination shown | User | Browser IndexedDB settings | Prove local consent state | Until withdrawal or local deletion | Withdraw, delete |
| Model request | User input, recent logs, summary, status snapshot, world line | Browser | Configured model service through FastAPI | Generate title, narration and decisions | Provider- and operator-specific; must be configured before launch | Described in notice; deletion subject to provider terms |
| Service metadata | Request ID, duration, status, model, token counts, error category | Backend | Production logs / metrics | Reliability, abuse prevention and cost control | TBD before production | Contact operator |

## Explicitly prohibited input

The UI instructs users not to enter government identifiers, passwords, authentication codes, financial account data, precise addresses, health records or other real-world sensitive information. P0 content and input controls must avoid intentionally collecting these fields.

## Data boundaries

- Provider API keys are server-side secrets and are never part of a user export.
- Local exports exclude settings whose key name indicates a password, token, secret or API key.
- The current backend must not log raw story bodies in production by default.
- Model provider names, processing regions and retention terms must be reviewed and configured before public release.
- Cross-border data transfer and minor data handling require a separate legal review when applicable.

## Production fields still requiring an owner decision

- Legal operator name.
- Privacy contact channel and response SLA.
- Production model providers and processing regions.
- Backend diagnostic retention period.
- Hosting and log storage regions.
- Request deletion workflow for data retained outside the browser.
