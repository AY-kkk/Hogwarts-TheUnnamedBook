# Privacy notice content baseline

- Version: 2026-07-17
- Status: Technical baseline; legal sign-off required before public release
- Operator: supplied by `VITE_OPERATOR_NAME`
- Privacy contact: supplied by `VITE_PRIVACY_CONTACT`

## What the product processes

The product processes character profiles, game state, user actions, generated stories, relationship data, world-line events and a local consent record. These records are primarily stored in the user's browser through IndexedDB.

To generate stories and game decisions, the product sends the necessary user input, recent story context, summary, game state and world-line context to the configured model provider through the backend API. The production provider and processing region are disclosed through `VITE_MODEL_DATA_DESTINATIONS`.

## Why the product processes it

- Create and maintain a character.
- Generate narrative, chapter titles and rules decisions.
- Keep the story consistent across sessions.
- Detect errors, prevent abuse and control model costs.
- Respond to privacy, security and content reports.

## User choices

Users can decline model transfer, in which case AI features remain unavailable. After accepting, users can view the notice again, export local data, withdraw consent or permanently delete local data.

A changed privacy-policy version invalidates the old consent and requires a new confirmation.

## Important limitations

Clearing browser storage removes Local-First saves unless the user exported a copy. Model providers and production diagnostic systems may process data outside the browser according to the published provider terms and production retention schedule.

Users should not enter real-world sensitive personal information into character profiles or stories.

The product applies a configurable age/guardian acknowledgement before AI use, labels generated stories, and offers a report action. A report submits reference identifiers, category and the reporter's optional note; it does not automatically attach the complete story body.

## Release gate

Public release is blocked until the operator name, contact channel, model destinations, processing regions, retention periods and any applicable cross-border or minor-data obligations receive written legal approval.
