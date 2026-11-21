# TattLabStudios

TattLab Studios client website (tattlabstudios.co.uk): static SEO pages, blog, contact/booking/finance forms via a small FastAPI.

## Stack

Static HTML + FastAPI (main.py) behind nginx

## Commands

```bash
# install
pip install -r requirements.txt
# run
uvicorn main:app --reload --port 8080
# test
(no automated tests yet: run it and check the changed pages by hand)
```

## Deploy

Fly app `tattlabwebsite` via GitHub Action fly-deploy.yml on push to main. SEO-tuned: keep changes invisible to visitors unless asked.

## Environment variables (names only; values live in Fly secrets / local .env, never in git)

GMAIL_USER GMAIL_APP_PASSWORD NOTIFY_EMAIL NOTIFY_EMAIL_BOOKING NOTIFY_EMAIL_FINANCE TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_SENDER TWILIO_TO BOOKING_APP_URL CONSENT_INTAKE_KEY

Needed in a cloud session: none. Pushing to main deploys!

## Conventions

- Work on a branch and open a PR; Ben merges. Never commit secrets or .env files.
- Keep changes small and explain them in plain words.
- Ben's defaults for his apps: OneSignal push alerts, an admin Visitors tab, full SEO (landing pages, sitemap) where it fits.
