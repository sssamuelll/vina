# Security Policy

## Supported versions

OpenClo is under active development. Security fixes land on `main` and ship with the next deploy. There is no long-term support branch yet.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting: open the repository's **[Security tab](https://github.com/sssamuelll/openclo/security)** and click **Report a vulnerability**. This creates a private advisory only the maintainers can see. Include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept helps),
- affected files or components if you know them.

You can expect an acknowledgement within a few days. We'll work with you on a fix, coordinate disclosure once a patch is available, and credit you if you'd like.

## Scope and context

OpenClo runs client-side in the browser and stores design work locally (IndexedDB), so most of the attack surface is in the client. Areas worth a careful eye:

- **Imported files.** DXF/AAMA and image imports are parsed in the browser; malformed or hostile input reaching the parser or the AI copilot's prompt is the most relevant risk class.
- **Copilot tool execution.** The agent operates the app through a tool layer; a report showing a tool can be driven to an unintended destructive or exfiltrating action is in scope.
- **Third-party plugins / skills.** The skill system executes contributed code; sandbox-escape reports are welcome.

Out of scope: findings that require a compromised host or browser, social-engineering of the user, or denial of service against a user's own local session.
