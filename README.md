# pickup-vball

Viroj's Pickup: the site for an invite-only pickup volleyball group in
Montgomery County, MD, served at **https://vball.moco-pickup.com**. The admin
books school gyms most nights of the week; players see the nights, RSVP in,
maybe or out, and get the address and the verdict by email.

It started as a copy of [pickup-bball](https://github.com/apnar/pickup-bball)
(the Monday basketball group on moco-pickup.com) and keeps its architecture:
one Cloudflare Worker, one D1 database, sign-in links in every email, and an
RSVP cycle that runs itself. The look and the copy are new -- see "Design"
below -- and the volleyball-specific product (credits, check-in, skill
levels, formats) is planned rather than built; see "What's next".

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Hono, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - API routes, served from inside the TanStack Start Worker
- **oRPC** - End-to-end type-safe RPC between the pages and the API
- **Cloudflare Workers** - Hosting for the whole site, single Worker
- **Drizzle** - TypeScript-first ORM
- **Cloudflare D1** - SQLite database
- **Authentication** - Better-Auth
- **Email and texts** - Telnyx email and messaging APIs, called with plain `fetch` from `packages/email`
- **Turborepo** - Optimized monorepo build system
- **Biome** - Linting and formatting

## Getting Started

Install dependencies:

```bash
pnpm install
```

## How it is hosted

The whole site runs as a single Cloudflare Worker on the free plan:

- `apps/web` is a TanStack Start app built with the Cloudflare Vite plugin. Static assets are served by Workers Assets and pages are server-rendered in the Worker.
- The Hono API lives inside the same Worker at `/api/*` (`apps/web/src/server/app.ts`, mounted by `apps/web/src/routes/api/$.ts`). Same origin means no CORS and ordinary same-site cookies.
  - `/api/auth/*` - Better Auth
  - `/api/rpc` - oRPC (the web app calls this from the browser and calls the router directly during SSR)
  - `/api/unsubscribe/:token` - one-click unsubscribe pages for list emails
  - `/api/telnyx/webhook` - Telnyx tells the app about bounces, complaints, delivery, and the texts people send back
  - `/api/health` - health check
- A Cron Trigger runs the Worker's `scheduled` handler (`apps/web/src/server.ts`) every half hour. It runs the RSVP cycle: five emails on a fixed clock and the 1 PM verdict on whether a night is on. See "The RSVP cycle" below.
- The database is Cloudflare D1 (SQLite) accessed through Drizzle via the `DB` binding. Env vars, secrets and bindings come from `cloudflare:workers` (typed in `packages/env/env.d.ts`, which must match `apps/web/wrangler.jsonc`).

## Local development

1. Create `apps/web/.dev.vars` from `apps/web/.dev.vars.example` and set a random `BETTER_AUTH_SECRET`. `TELNYX_API_KEY` is optional: without it every email and text (phone codes included) is printed to the dev server's console instead of sent, which is the normal local setup.
2. Apply the migrations to the local D1 database (stored under `apps/web/.wrangler/`):

```bash
pnpm run db:migrate:local
```

3. Start the dev server. Vite runs the server side inside workerd, so bindings behave as they do in production:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Who sees what

The site shows strangers one page and players everything else.

- **Anonymous visitors** get a short description: pickup volleyball most weeknights, somewhere in Montgomery County, the house rules, and how to get in. No gym, no start time, no booked dates, no headcount, no names.
- **Players** — anyone with a session — get everything: the next night with its gym and time, the schedule, the roster, and one-tap RSVP under their own name. They also see their own credit balance and history on `/credits`, and nobody else's.

Nobody signs themselves up. Public sign-up is closed (`emailAndPassword.disableSignUp`), and there is no join form. An admin adds an address on `/admin/users`, the welcome email goes out, and **every link in every email that person gets is unique to them and signs them in when clicked**. That link is a bearer token, which is why the emails say not to forward it. The one exception is the permit PDF: it is meant to be waved at gym staff, so its URL carries nothing.

Sessions last 180 days and roll forward. The session cookie caches the user for five minutes, so ordinary navigation costs no database read — and a role changed by SQL takes up to five minutes to show up.

**One list, three states.** There is a single table of people — `user` — and it is the roster, the mailing list and the accounts all at once. Every person is in exactly one state, shown and changed on `/admin/users`:

| | Gets email | Can sign in | Can take a spot | Who sets it | Ends how |
|---|---|---|---|---|---|
| **Active** | yes | yes | yes | — | — |
| **Suspended** | only on an explicit "everyone" send | yes | no | the person, or an admin | on its own date, or "I'm back" |
| **Deactivated** | never | no | no | **an admin** | an admin |

Both non-active states carry a reason and record who set them; a suspension can also carry a return date. There is no unsubscribe that leaves somebody on the roster: email is how this group talks, so stepping away from the email is stepping away from the nights, and it is temporary by default because the usual cause is an injury or a busy month. A suspension is stored as `status = 'suspended'` plus `suspended_until`, and **a date in the past already counts as active** — `effectiveStatus` in `packages/db/src/people.ts` decides, so nobody is stranded by a cron that did not run. The hourly job only tidies the row.

Losing access is deactivation, and only that: it is the one thing that sets Better Auth's `banned` (in the same statement, so the framework closes the password door), revokes every session, and makes the person's emailed links redirect to `/login?error=revoked`. Nothing is ever deleted, and an admin can undo it. The session cookie caches the user for five minutes, but every API call re-reads the person's row first (`requireAuth` in `packages/api/src/index.ts`), so a just-deactivated player gets UNAUTHORIZED on the next call and a just-demoted admin gets FORBIDDEN, cache or no cache. Only the page shell they already have on screen outlives the change.

Passwords are optional for players. Password sign-in is the default form on `/login`, and any player can set one from `/dashboard`; the emailed links keep working either way. **An admin with a password signs in with the password only**: an admin's link token is the whole site sitting in every email they get, one forward away from a stranger, so once an admin has set a password the link endpoint sends them to `/login?error=admin` instead of opening a session. An admin who has not set one yet keeps using their link (it is the only way they have in, and the first admin on a fresh database arrives that way); setting a password on `/dashboard` is what closes it. **Every admin should set one.** Below the sign-in form, "Email me my link" mails a fresh one to any address on the list, at most once every ten minutes, and says the same thing whether or not the address is on it.

## Games, permits and admins

A night (a `game` row in the code) exists only once a gym has been rented. Admins keep the list of gyms, book nights in them and file the permit PDFs; players see the schedule and the next night's headcount.

- **Admins** are accounts with `role = 'admin'` (Better Auth's admin plugin). Promote the first one with a SQL command, then use the Users tab on `/admin` to promote others:

```bash
pnpm --filter web exec wrangler d1 execute DB --remote --command "update user set role='admin' where email='you@example.com'"
```

  Drop `--remote` to do the same against the local database. The role is read from the session cookie cache, so it takes up to five minutes to apply; signing out and back in is quicker.

- **The first account on an empty database** cannot come from the site: sign-up is closed and adding people needs an admin. Write your own row, then click your own link. Nothing else is a special case; this is the ordinary join, done with SQL instead of the admin page — and because people and accounts are one table now, you can make yourself an admin in the same statement.

```bash
# 1. Put yourself on the list, as an admin, with a token to get in with.
pnpm --filter web exec wrangler d1 execute DB --remote --command "insert into user (id, name, email, email_verified, role, status, source, link_token, unsubscribe_token) values (lower(hex(randomblob(16))), 'Your Name', 'you@example.com', 1, 'admin', 'active', 'admin', lower(hex(randomblob(16))), lower(hex(randomblob(16))))"

# 2. Read the token back.
pnpm --filter web exec wrangler d1 execute DB --remote --command "select link_token from user where email='you@example.com'"
```

  Open `https://vball.moco-pickup.com/api/auth/link?k=<that token>`. It signs you in, and is the same link the welcome email would have carried. Then add everyone else from `/admin/users`.
- **Gyms** live in the `gym` table (name, address, notes) and are managed on `/admin/gyms`. A gym is written down once -- the address, and the "use the side door by the tennis courts" that would otherwise live in somebody's texts -- and every night, email and permit reads the same answer. Both are shown to players with the game, so the address is in the email they read in the car.
- **Games** live in the `game` table (date, start, `gym_id`, notes, optional permit). Admins manage them on `/admin` (Nights), where the gym is a dropdown that defaults to **the gym booked most recently**, because the next night is usually at the same one. A game cannot exist without a gym (`gym_id` is NOT NULL), and a gym with games on it cannot be deleted until they are moved or gone. The home page shows the next game on or after today; `/schedule` lists upcoming and recent games. Both are players-only.
- **Permits** are PDFs stored in the `PERMITS` R2 bucket (`pickup-vball-permits`) with a row in the `permit` table. Admins upload them on `/admin/permits` and attach them to games. On upload they also tick **which gyms the permit covers** -- one piece of paper from the county often rents two gyms -- which is a set of rows in `permit_gym` and can be re-ticked later from the Gyms button on any permit. Coverage is paperwork, not a booking: it sorts the permit dropdown when an admin books a game, and nothing more. Anyone with the link can open `/api/permits/<id>/file` (add `?download=1` to download), so a permit can be shown to gym staff from any phone.
- **Headcount** rows in `rsvp` belong to a game (`game_id`). A player taps "I'm in as {name}" to put themselves on the sheet (`rsvp.addMe`, which claims the row by `user_id` and marks it "you"), and can type a friend's name in as well. Deleting a game deletes its headcount.

The oRPC procedures are `account.*`, `games.*`, `gyms.*`, `permits.*`, `rsvp.*`, `people.*`, `mail.*`, `credits.*` and `checkin.*` under `packages/api/src/routers`. Admin-only procedures use `adminProcedure` from `packages/api/src/index.ts`; `games.*` and `rsvp.*` reads are `protectedProcedure`, so a stranger gets UNAUTHORIZED rather than the address of the gym. Every procedure is POST-only (`StrictGetMethodPlugin`): the RPC protocol would otherwise take GET with the input in the query string, and a Lax cookie rides along on a top-level GET, which turns any link into a click-to-act-as-you. There is no OpenAPI handler and no `/api/reference`. `/roster` is built from the `user` table by `people.roster`, ranked by nights actually played -- a `protectedProcedure` that deliberately returns less than the admin `people.list`: names, standing and counts, never addresses, tokens or the reason somebody is on a break. Rules and game conditions remain plain content in `apps/web/src/content/run.ts`.

## Groups

The group runs several kinds of night -- Sunday Night Volleyball, Saturday
Night RevCo 6s, Advanced Level Random Days -- and each is for its own set of
people. A **group** (`game_group`, managed on `/admin/groups`) is one of
those: a name, plus the format (6 v 6 or 4 v 4), type (coed or reverse coed)
and number of spots a night in it starts with. Every night is booked in a
group; picking it on the booking form fills those in, and each can still be
changed for that one night.

- **Who sees what.** Players are put in groups on `/admin/groups` (Members),
  on a player's page, or when they are added. A player sees -- on the home
  page, the schedule, and a night's own page, even by direct link -- only the
  nights in their groups, and only those groups' RSVP emails reach them; the
  waitlist and the response record follow the same line. It is enforced on
  the server (`packages/api/src/access.ts`); a night outside your groups
  answers "not on the schedule", the same as one that does not exist.
  Admins see every night, and get a group's emails only if they are in it.
- **Somebody in no group sees no nights.** The Players table says so in
  amber, and their home page tells them an admin adds them.
- **Deleting a group** is refused while nights are booked in it; its
  memberships go with it. Changing a group's defaults never touches nights
  already booked.
- Nights booked before groups existed have no group and stay open to all.
- Six groups were seeded by migration 0005, all 6 v 6 with 42 spots, the
  two RevCo ones reverse coed. Edit them to taste.
- A gym holds one night at a time (`game_gym_date_time_uidx`), so two groups
  can play at the same hour in different gyms.

## Credits and check-in

One credit is one night played, and costs $5 (`CREDIT_PRICE` in `packages/api/src/run.ts`). Players pay Viroj (Venmo @Viroj7, or cash) and an admin turns the money into credits; the gym then charges them, one credit a night, when the admin closes the night at check-in.

- **The ledger is append-only.** Every change is a `credit_entry` row: who, how many (`delta`), why (`purchase`, `played`, `refund`, `correction`), which night, how it was paid, the note, the admin and the time. Nothing ever updates or deletes one. A balance is the sum of a person's rows; there is no balance column to drift from it, and the balance after each row is worked out when the ledger is read.
- **Giving credits** (`/admin/credits`, the Give credits tab) is built for a phone: find the player, pick the number (5 / 10 / 20 / 30, or step it), say how they paid. The dollars are the credits times the price. The player gets a receipt email (`credits_added` in `email_send`), sent to the "everyone" audience so somebody on a break still gets it.
- **Check-in** (`/admin/checkin/<night>`, from the Check in button on a night or the Tonight card on Give credits) opens on the day of the night. Everybody who said they were in is listed with their balance, flagged at zero or below so the admin can collect at the door; "+ Walk-in" adds anybody else in the group. Guests without an account are listed but cannot be charged: settle with them directly. Each tap is saved as it happens.
- **Closing the night** stamps `game.closed_at` and charges one credit to everybody checked in, in one D1 transaction. No-shows are not charged. After that the sheet is frozen and the night cannot be deleted. A night closed twice -- a double tap, two admins -- charges once: a partial unique index allows one `played` row per person per night, and the second close rolls back whole.
- **Balances may go below zero.** The group chose to flag rather than block: a player at zero or below sees a notice on the home page and can still RSVP. The ledger page counts how many players are there.
- **Fixing mistakes** is done from a player's page (`/admin/users/<id>`): **Refund** gives back one night's charge (once per night, also held by an index), and a **correction** adds or takes credits with a reason. Neither edits history; both are new rows.
- **The ledger** (`/admin/ledger`) shows this month's credits added and used, everybody's entries with the balance each left behind, filters for added / used and a player, and a CSV export of the whole thing (text cells that start with `=`, `+`, `-` or `@` are defused for spreadsheets).
- **Players** see their own balance and history on `/credits`, which also says how to pay. Nothing there writes, and nothing a player can do moves a credit.

## Email and texts

Players hear about nights by email, by text, or both, and get in through the links in them. Telnyx delivers both; the app owns the list, the templates, the choices and the log.

- **Who gets it.** The `user` table — the same rows that decide who is a player, because there is only one list. Admins add people on `/admin/users` (`source = 'admin'`); older rows came from the site form (`site`) and the old public sign-up (`signup`). Each person has an `unsubscribe_token` for the footer link and a `link_token` for the sign-in links, both plain text (they ride in every email anyway) and both stamped by the `user.create` hook, so nobody can exist without a way in.
- **Which audience.** Cycle messages always go to **active** people only; somebody on a break does not need the reminders. The ad-hoc message on `/admin/email` offers **Active** (default) or **Everyone**, where Everyone also reaches people on a break. Neither audience ever includes anybody deactivated. `email_send.audience` records which was used. The one query behind all of it is `listRecipients` in `packages/db/src/people.ts`.
- **Which channel.** On `/dashboard` each player picks Off, Email, Text or Both for each kind of message (`TOPICS` in `packages/api/src/notify.ts`: night calls, reminders to answer, night confirmed, on or off, off the waitlist, game-day reminder, a spot opened, low credit, credit receipts, group updates). No row in `notify_pref` means the default (email; the spot alert is off). The three about a night somebody said yes to -- confirmed, the verdict, off the waitlist -- cannot be Off. `channelsFor` turns a choice into channels and falls back rather than to nothing: text with no usable number goes by email, email that bounced goes by text. Sign-in links asked for on `/login`, the welcome and password emails always go by email.
- **Stepping away.** The footer of every list email links to `/api/unsubscribe/<token>`, which shows a form asking for how long and why; only the POST acts (mail clients prefetch link targets). Every email also carries our own `List-Unsubscribe` and `List-Unsubscribe-Post` headers pointing at the same POST, so a mail app's one-click unsubscribe lands as an open-ended break. Players can do the same thing from `/dashboard` or straight from the RSVP board, and come back from any of them in one tap.
- **How a link signs you in.** Every link in a list email or text points at `/api/auth/link?k=<link_token>&to=<path>` (texts use `g=<night id>`, short for `to=/rsvp/<id>`), a GET endpoint added by the `email-link` plugin in `packages/auth/src/link.ts`. It finds the person, marks an unverified address verified, opens a session and redirects to `to` — which is checked by `safeReturnPath` and falls back to `/` for anything that points off this site. An unknown token lands on `/login?error=link`, a deactivated one on `/login?error=revoked`, an admin's with a password set on `/login?error=admin` (see "The one list"). The token is a bearer credential, so **the request log prints paths without query strings** and nothing else may log a URL. Click tracking is off on every email (`tracking_settings`), or Telnyx would rewrite each link -- token and all -- through its own domain. If a link does get out, "New link" on `/admin/users` (`people.rotateLink`) kills every link that person was ever sent and emails a fresh one.
- **Personalisation.** Templates carry `{{ params.key }}`-style placeholders (`PARAM` in `packages/email/src/render.ts`); the mailer fills them in per recipient (`fillParams`) and sends one copy each, up to 1,000 per Telnyx batch request -- a full list is one subrequest. Texts keep the key a placeholder in the outbox and the drain fills it in as each one leaves, so no stored row is a live way in.
- **Braces in what people type.** The mailer runs `sealTemplate` over the finished subject, HTML and text before filling anything in: a zero-width space after any `{` that opens a tag, except inside our own placeholders. Telnyx documents Liquid only for stored templates, which we never send, so this is insurance -- but the failure it insures against is a guest called `{% if %}` getting a whole cycle send rejected every half hour. Names also refuse braces at the box.
- **What goes out.**
  - *Welcome* — when an admin adds someone, or resends their link from `/admin/users`, or a player asks for one from `/login`. Carries their concrete sign-in link, no list footer. Email only.
  - *The five cycle messages* — sent by the Cron Trigger, described in "The RSVP cycle" below. An admin can fire any of them early from `/admin/email`, or resend one to a single person from `/admin/users`.
  - *Game-day reminder* — a few hours (`REMINDER_LEAD_HOURS`) before a night that is on, to the people in. *A spot opened* — when a full night with nobody waiting has room again, at most hourly. *Low credit* — when closing a night takes somebody from two credits to one. All three in `packages/api/src/jobs/alerts.ts`.
  - *Message* — anything an admin types on `/admin/email`, with a short "text version" for whoever takes group updates by text (blank means the subject). "Send to me first" delivers a test copy to the signed-in admin only, by text too if they have a number.
  - *Credits added* — the receipt to one player when an admin adds credits they paid for.
  - *Account* — Better Auth's password reset from `/forgot-password`, and the verification email left over from the sign-up era. These carry no unsubscribe link.
- **Texts.** Every text is a row in `sms_out` first. A Worker on the free plan gets 50 outside calls a run and each text is one, so the first send in a request drains up to 30 as it finishes (`kickDrain`) and a once-a-minute cron drains 40 a run (`packages/api/src/jobs/sms-drain.ts`). The drain re-checks each person as it goes: a number removed, a STOP, a deactivation or a night already started turns the text into `skipped`. List texts queued between 9 PM and 8 AM ET wait for the morning (`textSendAfter`); codes and replies to somebody's own text go at once. Each template has a text sibling in `packages/email/src/texts.ts`, tested to fit two GSM-7 segments, and `toGsm` takes curly quotes and the like out on the way, since one would send the whole text as UCS-2 at three times the price.
- **Phone numbers.** A player adds one on `/dashboard`: they tick the consent box (wording in `TEXTS.consent`, `apps/web/src/content/run.ts`), we text a 6-digit code, they type it back. Only an HMAC of the code is stored (`phone_check`); it lasts 10 minutes, five wrong tries kill it, and a number gets at most one code a minute and five a day. `user.phone` only ever holds a verified number, unique across the group, so a reply means one person. Admins can remove a number but never add one. US numbers only.
- **Replies.** Replying IN, OUT or MAYBE (or yes/no/y/n) answers for the newest night we texted that person about that is still open (`pickNight` in `packages/api/src/sms-parse.ts`), through the same `recordAnswer` the site uses (`packages/api/src/answer.ts`). The whole message must be the answer -- "No problem, I'm in" is not a NO. The reply names the night and links to it. A night already decided says so and changes nothing, like the site. Anything else gets one explanation an hour; a number nobody verified gets nothing. STOP/START are answered by Telnyx and mirrored in `user.sms_opted_out_at`, so their texts go by email meanwhile. `sms_in` keys every inbound text by Telnyx's id, so a redelivered webhook is acted on once.
- **Bounces.** Telnyx reports to `/api/telnyx/webhook` (`apps/web/src/server/telnyx-webhook.ts`, Ed25519-signed; without `TELNYX_PUBLIC_KEY` the route answers 404). A hard bounce (code 30001) or spam complaint sets `user.email_blocked_at`: somebody with a usable number keeps getting everything by text, somebody without is put on an **open-ended break**, as before -- never a deactivation. Coming back from a break, or "Try email again" on `/dashboard`, clears it. Telnyx keeps its own suppression list for those addresses; there is no API call to lift it from here.
- **Sender.** "Viroj’s Pickup" <`info@moco-pickup.com`>, set in `packages/email/src/sender.ts`. Any address on a domain verified in Telnyx works.
- **Not switched on yet.** Production has no `TELNYX_API_KEY`, so every email and text is printed to the Worker log instead of sent (Workers Logs, or `pnpm --filter web exec wrangler tail`). That includes the welcome emails with sign-in links, so until email is on, new players have to be let in by hand.
- **Log.** Every list send writes one `email_send` row (kind, subject, how many emailed, how many texted, failures, Telnyx message ids). `/admin/email` shows the last twenty and how many texts are waiting.

Setting it up:

1. In the Telnyx portal, create an API key (Keys & Credentials > API Keys) and copy the account's public key (Keys & Credentials > Public Key).
2. Email: add `moco-pickup.com` as an email domain and publish the records it gives you in Cloudflare DNS (ownership TXT, DKIM at `telnyx1._domainkey`, and `include:spf.telnyx.com` in the SPF record), then verify it. **Turn off unsubscribe tracking, open tracking and click tracking** on the domain -- we send our own unsubscribe headers, and click tracking would route sign-in tokens through Telnyx. A new domain is warmed up over its first week (250 recipients on day one), shared with the basketball site.
3. Add a domain webhook to `https://vball.moco-pickup.com/api/telnyx/webhook` for `email.bounced`, `email.complained` and `email.unsubscribed`.
4. Texts: buy a local number, put it on a messaging profile whose webhook is the same URL, with opt-out handling and a HELP reply on. Register the number for 10DLC as a sole proprietor (one number; usually approved in days): the campaign description and sample messages can come from `/sms`, and the opt-in is the dashboard's consent box -- reviewers will want a screenshot of it, and `/sms` and `/privacy` are public for them. Then set `TELNYX_FROM_NUMBER` (E.164) and `TELNYX_MESSAGING_PROFILE_ID` in `apps/web/wrangler.jsonc` `vars`.
5. Production: `pnpm --filter web exec wrangler secret put TELNYX_API_KEY` and `... TELNYX_PUBLIC_KEY`.
6. Rate limiting. Better Auth's limiter keeps its counts in D1 (`rate_limit`, in migration 0000) keyed by `cf-connecting-ip`, so the password door, the reset form and the link endpoint are actually limited across the edge. The one public oRPC call, `people.requestLink`, has only its per-address ten-minute cooldown; put a **Cloudflare WAF rate-limiting rule** in front of it and the auth routes (zone > Security > WAF > Rate limiting rules): something like 20 requests per minute per IP on `/api/auth/*` and 5 per minute on `/api/rpc/people/requestLink`. The rule lives in the dashboard, not in this repo.
7. To exercise things locally with the dev server running: `curl "http://localhost:3001/cdn-cgi/local/scheduled?cron=0+*+*+*+*"` runs the cycle and the reminders, `?cron=*+*+*+*+*` drains the text outbox. **Leave `TELNYX_API_KEY` unset while you do**, or the job emails and texts everybody in the local database for real. To try the webhook, put a test Ed25519 public key in `.dev.vars` as `TELNYX_PUBLIC_KEY` and sign requests with its private half (`${timestamp}|${body}`, headers `telnyx-signature-ed25519` and `telnyx-timestamp`).

The templates, the Telnyx clients, the signature check and the text rules are pure functions with tests: `pnpm run test`.

## The RSVP cycle

Nothing is emailed when a night is booked. Each night asks the group on a
fixed clock instead, and decides itself at 1 PM on the day, the confirmation
deadline in the house rules.

| # | When | Who | What |
|---|---|---|---|
| 01 | 5:00 PM the day before | everybody active | there is a night tomorrow; in, maybe or out |
| 02 | 9:00 AM on the day, only under 12 in | only those who have not answered | the names already in, and how many short |
| 03 | the moment the 12th yes lands | everyone in or maybe | the night is on |
| 04 | 11:30 AM on the day, only under 12 in | the maybes and anyone who has not answered | last call |
| 05 | 1:00 PM on the day | everyone who answered — and if it is off, everybody else | 8 or more in and it happens; fewer and it does not |

`CONFIRM_AT` (12) and `PLAY_AT` (8, the fewest a night is played with)
and the stage times live in
`packages/api/src/cycle.ts`, and `/admin/cycle` renders that same array — so
the write-up in the admin section cannot describe a schedule the job is not
keeping. Each night carries its own format (`6v6` or `4v4`, chosen when it
is booked -- a 4 v 4 night is planned, not a short 6 v 6 one) and its own
number of spots (`game.capacity`; the booking form offers 32, 42 and 56,
from `CAPACITY_PICKS` in `packages/api/src/run.ts`). A player's yes on a full
night -- or on one where somebody is already waiting -- puts them on the
**waitlist** instead (`rsvp.response = 'waitlist'`, in line by
`waitlisted_at`), and they see their place on the board. Whenever a spot
frees -- someone switches to out or maybe, a guest is taken off, an admin
adds spots -- the front of the line is moved in and emailed (`waitlist_in`;
for a guest, whoever added them). All of it is in
`packages/api/src/waitlist.ts`. An admin fixing somebody else's row can still
put them in past the number; an admin's own answer waits in line like
anyone's. The
times are fixed, not relative to each night's start: a night that starts
earlier than 7:30 still gets every stage that falls before it, and past the
start the verdict is recorded without emailing anybody.

An answer is **in, maybe or out**. A maybe counts toward nothing; it only
decides who gets the 3:30 last call. Guest names typed onto the sheet
count toward both thresholds, but nobody can email them,
so a cancellation goes to whoever put them down.

Three rules keep the job honest, all of them in `packages/api/src/jobs/plan.ts`
and unit-tested there:

- **The opening call is never skipped.** A gym booked at one in the afternoon
  still gets "there is a night tonight" before anything reminds anybody to
  answer.
- **One stage per pass, the latest one due.** An overdue stage is abandoned,
  not delivered late.
- **Ninety minutes between sends, except the verdict.** The one email nobody
  may miss is "tonight is off".

Each stage stamps a column on `game` when it is *resolved* — sent **or**
deliberately skipped — so a stage whose condition was not met is not retried
every half hour. What actually went out is in `email_send`, one row per send.
An admin can fire any stage early, or overrule the verdict, on `/admin/email`.

Every link in a cycle email lands on `/rsvp/<gameId>?a=<answer>`, which shows
the answer and waits for a tap. It does not record anything on load: mail
clients prefetch link targets, which is the same reason the unsubscribe footer
stopped acting on a GET.

## Design

The look is "Night Court", from a Claude Design handoff: a dark navy ground,
a hardwood-amber accent, Barlow Condensed 700-800 uppercase for headings,
numbers and buttons over Barlow for body text, rounded cards, and teal for
reverse coed. Tokens and helper classes are in
`packages/ui/src/styles/globals.css`; `CLAUDE.md` lists the ones to use. It is
built mobile first -- most people open it from an email on a phone -- with a
bottom tab bar on a phone, a top nav on a desktop and a sidebar for admin.
Text contrast meets WCAG AA, touch targets are at least 44px, and there is no
emoji anywhere.

Standing copy (site name, house rules, the "how it works" facts, payment) is
in `apps/web/src/content/run.ts`.

## Launch status

Phase 1 (this copy, reskinned) went live on 2026-10-19. Still to do before
the group uses it:

- [ ] The first admin (Josh, bootstrapped by SQL) **sets a password** on
      `/dashboard`. That also retires his sign-in link, which has been shared.
- [ ] **Turn on email and texts.** Telnyx account, `moco-pickup.com`
      verified with tracking off, the domain webhook, a number on a messaging
      profile, `TELNYX_FROM_NUMBER` / `TELNYX_MESSAGING_PROFILE_ID` in
      `wrangler.jsonc`, then `wrangler secret put TELNYX_API_KEY` and
      `TELNYX_PUBLIC_KEY` (see "Email and texts", steps 1-5). Until then
      every email and text -- welcome links included -- goes only to the
      Worker log.
- [ ] **Register the number for 10DLC** (sole proprietor), using `/sms`,
      `/privacy` and a screenshot of the consent box on `/dashboard`. Texts
      are refused by the carriers until it is approved.
- [ ] Once it is live, verify your own phone and reply STOP, then START, to
      check the opt-out mirror before players add numbers.
- [ ] **Add Viroj** on `/admin/users` and make him an admin; he should set a
      password too. Then add the players.
- [ ] Book the gyms (`/admin/gyms`) and the first nights (`/admin`).
- [x] Add a `CLOUDFLARE_API_TOKEN` repository secret so pushes to `main`
      deploy (see "Automatic deploys"). Set 2026-10-19.
- [ ] Check that the zone's WAF rate-limiting rules (Email, step 5) cover
      `vball.moco-pickup.com` as well as the basketball host.
- [ ] Have Viroj review the house rules and the "how it works" facts in
      `apps/web/src/content/run.ts`.

## What's next

The design handoff also specified a volleyball product that this site does
not have yet. The full spec -- data model, rules, screen map, open questions
for the group -- and the 12 approved mockups are in **`docs/handoff/`**, which
is gitignored because it names the organizer and his payment handle (the
original is `~/virojs-pickup-handoff.zip` on the maintainer's machine). Read
`docs/handoff/README.md` before starting any of this. Credits and check-in
are built (see "Credits and check-in"), and so are groups, which took the
place of the spec's skill levels (see "Groups"); the rest, in rough order:

- **A cutoff per night**, enforced by the server. Today answers can change
  after the 1 PM verdict.
- **In/out only**, if the group wants to drop "maybe".

Also from the spec but not built: admin-only notes on a player,
and a setting to block RSVPs at zero credits (the group chose to allow
negative balances for now).

Answered so far: balances may go negative; walk-ins are people in the group,
and guests without accounts are settled off the site; full nights have a
waitlist that moves people in automatically. Still open, to answer before the
matching piece is built: late-drop policy, whether
players see their own level, extra reverse-coed rules. (Texts are built:
see "Email and texts".) Mockups with no
counterpart yet: the skill-level and format parts of `A-Sessions`,
`A-Session`, `A-Admin`, `A-NewSession` and `A-PlayerDetail`.

## Database changes

1. Edit the schema in `packages/db/src/schema`.
2. Generate a migration: `pnpm run db:generate`. This writes SQL into `packages/db/src/migrations`, which is what wrangler applies.
3. Apply it locally with `pnpm run db:migrate:local`, and to production with `pnpm run db:migrate:remote`.

Inspect the local database with `pnpm --filter web exec wrangler d1 execute DB --local --command "select * from user"`.

## Deploying to Cloudflare

One-time setup:

1. Log in: `pnpm --filter web exec wrangler login`.
2. Create the database: `pnpm --filter web exec wrangler d1 create pickup-vball-db` and paste the returned id into `database_id` in `apps/web/wrangler.jsonc`.
3. Set the auth secret: `pnpm --filter web exec wrangler secret put BETTER_AUTH_SECRET`.
   Set the Telnyx keys the same way: `pnpm --filter web exec wrangler secret put TELNYX_API_KEY` and `... put TELNYX_PUBLIC_KEY` (see "Email and texts").
4. Create the permit bucket: `pnpm --filter web exec wrangler r2 bucket create pickup-vball-permits`.
5. Apply migrations to production: `pnpm run db:migrate:remote`.
6. Deploy: `pnpm run deploy`.
7. Set `BETTER_AUTH_URL` in `apps/web/wrangler.jsonc` `vars` to the URL wrangler printed (or your custom domain) and deploy again.
8. Get yourself an account: on a brand new database, follow "The first account on an empty database" in "Games, permits and admins". Otherwise ask an existing admin to add your address on `/admin/email` and click the link they send you.

### Automatic deploys

`.github/workflows/deploy.yml` runs on every push and pull request. It lints with Biome, runs the unit tests, typechecks and builds. On pushes to `main` it then applies pending D1 migrations and deploys the Worker with Cloudflare's `wrangler-action`.

It needs one repository secret, `CLOUDFLARE_API_TOKEN`: a Cloudflare API token created from the "Edit Cloudflare Workers" template with **D1: Edit** and **Workers R2 Storage: Edit** added, and its zone resources set to `moco-pickup.com` so it can attach the custom domain. Set it with `gh secret set CLOUDFLARE_API_TOKEN` or in the repository's Actions secrets. Until the secret exists the deploy job skips with a warning instead of failing. The account id is in `apps/web/wrangler.jsonc`, so no account secret is needed.

You can still deploy by hand with `pnpm run deploy`.

## Project Structure

```
pickup-vball/
├── apps/
│   └── web/         # Fullstack app: TanStack Start pages + Hono API under /api (one Worker)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # oRPC router / business logic
│   ├── auth/        # Better Auth configuration
│   ├── db/          # Drizzle schema (auth/people, gym, game, permit, rsvp, credit_entry, check_in, email_send) and D1 migrations
│   ├── email/       # Telnyx clients, email and text templates and their tests
│   └── env/         # Typed access to Worker env and bindings
```

## Available Scripts

- `pnpm run dev`: Start the dev server (pages and API) at http://localhost:3001
- `pnpm run build`: Build the Worker and static assets
- `pnpm run check-types`: Check TypeScript types across the workspace
- `pnpm run check`: Run Biome formatting and linting
- `pnpm run test`: Run the unit tests (email and text templates, Telnyx clients, the cycle's timezone and stage maths, the text rules)
- `pnpm run db:generate`: Generate a D1 migration from the Drizzle schema
- `pnpm run db:migrate:local`: Apply migrations to the local D1 database
- `pnpm run db:migrate:remote`: Apply migrations to the production D1 database
- `pnpm run deploy`: Build and deploy the Worker with wrangler
