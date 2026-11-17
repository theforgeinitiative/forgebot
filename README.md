# forgebot

The Forge Initiative's Discord bot, written in TypeScript with discord.js. It replaces the Go bot in `integrations/cmd/bot` and follows the conventions of `member-portal`: Node 22, strict TypeScript, npm, ESLint, Vitest and zod.

## What it does

### Slash commands

| Command | What it does |
|---|---|
| `/link-membership` | Opens a form that asks for the member's Household ID and Personal ID. On submit, the bot saves the user's Discord ID on the Salesforce Contact (`Discord_ID__c`). If the membership is **Current** or **Grace Period**, it also adds the member role and sets the user's nickname to their display name. |
| `/welcome` | Posts the public welcome message, which includes the Link Membership button. |
| `/unlock-storage unit:` | Gives a linked, current member a 1–2 hour igloohome PIN for a storage unit, sent by DM. The member must be **Approved** on the storage campaign in Salesforce. Every PIN issued is recorded in the unlock log sheet. |
| `/password site:` | Shows anyone with the member role the login for a shared account (URL, username, password and, if set up, the current 2FA code with a **New 2FA code** button). The reply is visible only to them. Sites are configured in environment variables (see below). |

### Events

- **Member joins the server.** If the user is already linked and their membership is current, the bot adds the member role, sets their nickname and greets them. Otherwise it posts the welcome message with a Link Membership button.

## Setup

### Discord application

In the Discord Developer Portal, on the **Bot** page, turn on the **Server Members Intent**. The bot can't log in without it.

The bot needs these permissions on the server:
- **Manage Roles.** The bot's own role must sit above the member role in the role list.
- **Manage Nicknames.**
- **View Channel** and **Send Messages** in the welcome channel.

Invite the bot with the `bot` and `applications.commands` scopes.

### Configuration

Every setting comes from an environment variable. See [.env.example](.env.example) for the list.
- **Production:** set them in Railway.
- **Local:** set them in `.env`.

The bot checks them all at startup and exits with a list of whatever is missing.

#### Shared logins (`/password`)

Each shared account is a group of variables that share a key, such as `BAMBU`:

```sh
SHARED_LOGIN_BAMBU_URL=https://bambulab.com      # required
SHARED_LOGIN_BAMBU_USERNAME=shop@example.org     # required
SHARED_LOGIN_BAMBU_PASSWORD=...                  # required
SHARED_LOGIN_BAMBU_TOTP_SECRET=JBSWY3DPEHPK3PXP  # optional: base32 2FA secret
SHARED_LOGIN_BAMBU_TOTP_SLACK=30                 # optional: grace period for the 2FA countdown
SHARED_LOGIN_BAMBU_NAME=Bambu Lab                # optional: defaults to "Bambu"
```

- **2FA secret.** When you turn on 2FA for the account, choose the option to enter the key manually (often "Can't scan the QR code?") and paste that key here. Add it to an authenticator app as well so admins keep access if the bot is down.
- **2FA slack.** Many sites still accept a code for a while after it expires. `TOTP_SLACK=30` adds 30 seconds to the "expires" countdown in the reply. The code itself is unchanged. Only set it after confirming how long the site accepts old codes.
- **Adding or changing a site.** Set the variables and redeploy. The site list uses autocomplete, so you don't need to run `deploy-commands` again.
- **Who can see them.** Anyone with the member role (`DISCORD_MEMBER_ROLE_ID`). Each view is logged with the user and site, never the credentials.
- The bot won't start if a site is missing a required variable or has an invalid URL or 2FA secret.

The storage lock list is defined in [src/config/storage-locks.ts](src/config/storage-locks.ts), not in an environment variable. After editing it, redeploy and then run `npm run deploy-commands`.

### Local development

Run the bot against a **separate dev application** and a test server. Two processes using the same token will both answer every interaction.

```sh
cp .env.example .env          # fill in dev app + Salesforce sandbox values
npm ci
npm run deploy-commands:dev   # registers commands to DISCORD_GUILD_ID only (instant)
npm run dev                   # runs src/ directly with Node type stripping, restarts on change
```

Checks, the same set that CI runs:

```sh
npm run lint && npm run typecheck && npm test && npm run build
```

## Deploying on Railway

- **Service type.** Run it as an always-on Railway service: serverless/sleep off, **exactly one replica**.
  - The gateway needs a persistent connection.
  - The igloohome variance counter is kept in memory.
  - A second replica would answer every interaction a second time.
- **Build and start.** [railway.json](railway.json) runs `npm run build` and starts the bot with `npm start`.
- **Health check.** Railway calls `/healthz` on `$PORT`. It returns 200 once the bot is connected to the Discord gateway.
- **Required variables.** Set every variable in `.env.example`.
  - `GOOGLE_SERVICE_ACCOUNT_JSON` is the full JSON key of a service account. Share the log sheet with that service account's email address as an editor.
  - `TZ` defaults to `America/New_York`. PIN windows and the "valid until" time in the DM depend on it.
- **Commands.** Slash commands are not registered at startup. After changing a command, run `npm run deploy-commands` once with the production environment variables (for example `railway run npm run deploy-commands`). This bulk-overwrites the global commands.
- **Deploy overlap.** While a deploy rolls over, the old and new instances are both connected for a few seconds.


## Later

- **OpenTelemetry.** Add tracing behind `OTEL_EXPORTER_OTLP_ENDPOINT`, the same way the portal does.
