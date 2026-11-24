# Necheskal — Apartment Proposal Review

A static Hebrew-language React and TypeScript app that analyzes a broker's apartment proposal against a client's requirements and a read-only JSON database.

## Getting started

```bash
npm install
npm run dev
```

Run tests and build the app:

```bash
npm test
npm run build
```

## Before business use

- `src/data/properties.json` contains five synthetic demo records with `DEMO-*` IDs. Do not use them for real decisions. Replace them only with approved data.
- The user enters the API key. It is held only in page memory and sent directly to OpenAI. The user and browser can access it. Do not use a shared key that must remain secret.
- Proposal and client-requirement text is also sent directly to OpenAI. Confirm that the applicable policies allow this before entering real information.
- The model is currently set to `gpt-4o-mini` in `src/services/analysisPipeline.ts`. Confirm model availability and API/CORS permissions for your account before deployment.
- Under the current specification, a missing or unmet `must` requirement means “Do not approve.” Change this only after a business decision.
- The LLM only extracts and summarizes information. The code determines comparison statuses and recommendation-check rules.
- The app does not use `localStorage`, `sessionStorage`, or cookies. Refreshing the page clears the input, API key, and report.

## Deployment

The app builds to static files with `npm run build`. Host it over HTTPS. Do not set an API key in build-time environment variables.
