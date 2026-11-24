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
- The user enters a Google Gemini API key. It is held only in page memory and sent directly to Google Gemini. The user and browser can access it. Do not use a shared key that must remain secret.
- Proposal and client-requirement text is also sent directly to Google Gemini. Confirm that the applicable policies allow this before entering real information.
- Users can choose from the Gemini models listed in the model selector in `src/app/App.tsx`. Confirm model availability and API/CORS permissions for your account before deployment.
- Under the current specification, a missing or unmet `must` requirement means “Do not approve.” Change this only after a business decision.
- The LLM only extracts and summarizes information. The code determines comparison statuses and recommendation-check rules.
- The app does not use `localStorage`, `sessionStorage`, or cookies. Refreshing the page clears the input, API key, and report.

## Deployment

The app builds to static files with `npm run build`. The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` deploys `main` to GitHub Pages. In the repository settings, open **Pages** and select **GitHub Actions** as the build and deployment source. The site URL will appear in the workflow's deployment summary.

The workflow uses Vite's relative asset paths so it works both on a project site (`https://<owner>.github.io/<repository>/`) and on a user or custom-domain site. The app's page selection is query-string based and does not require server-side routing.

GitHub Pages hosts only the UI. Analysis calls Google Gemini directly from the visitor's browser, so each visitor must provide their own API key. Do not put an API key in GitHub secrets or build-time environment variables.
