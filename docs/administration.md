# Administration guide

Audience: the person who runs the instance and manages its accounts.

## Admin and user roles

The **admin account** (default username `couplecards`) manages the instance, which includes users and the card deck. It does not play: the draw, ban and history screens are reserved to user accounts. The admin user interface lives at `/admin.html` and that is where admin sign-ins land.

**User accounts** are the players. Each user has their own bans and their own history.

A single person can take both roles if they are technically inclined. They would create a user account for themselves in addition to the admin account and sign in to whichever one they need at the moment. For example, Alice would log in as `couplecards` to create her user `alice`, then log out and sign in as `alice` to play.

## First sign-in

After `docker compose up`, open <http://localhost:3000> (or your HTTPS domain). The login page asks for credentials. Use `couplecards` as the username and `changeme` as the password. The default admin login is deliberately not `admin` to avoid attracting generic credential-stuffing probes.

You are immediately asked to change the password. It must be 12 characters or longer, include at least one uppercase letter, one lowercase letter, one digit and one special character, and pass a zxcvbn score of 4 or higher (the stricter threshold applied to the admin account).

Once the new password is saved, you land on the admin panel.

## Managing users

The **Users** tab in `/admin.html` lists every account on the instance.

### Create a user

1. Type a username in the form. Allowed characters are lowercase letters, digits, dots, dashes and underscores, with a length between 3 and 32 characters. Reserved names such as `couplecards`, `admin`, `demo`, `root`, `system`, `me`, `anonymous`, `null` and `undefined` are blocked.
2. Click **Create**. A dialog shows the initial password exactly once. Copy it and hand it to the partner in person, because the admin cannot retrieve it later.
3. The user signs in with this password and is then forced to choose a new one immediately.

### Reset a password

1. Click **Reset password** next to the relevant user.
2. A new one-time initial password is generated and displayed exactly once.
3. Every existing session for that user is invalidated.

### Unlock an account

After 10 failed login attempts in a row, an account is locked for 15 minutes. Click **Unlock** next to the user to clear the lock immediately.

### Delete a user

Deleting a user removes the account together with their history and their bans. The admin account cannot be deleted through the UI, and you cannot delete yourself.

## Managing cards

The **Cards** tab lists every card in the deck. Each card belongs to one of two piles: `home` or `outdoor`. These internal keys are stable and are translated per locale for display ("Home" / "Outdoor" in English, "Domicile" / "Extérieur" in French, "Zuhause" / "Draußen" in German, "Casa" / "Fuori" in Italian, "Casa" / "Fuera" in Spanish).

### Create a card

1. Click **Add a card**.
2. Pick an ID made of lowercase letters, digits and dashes. The ID must be unique across the deck.
3. Select a pile, write a title and write a description. Enable the **foil** flag to mark the card as a rare variant: it gets the gold-lined reveal treatment and is intentionally drawn less often than standard cards (see [architecture.md](./architecture.md) for the draw weighting).
4. Optionally pick an **emoji** slug for the card face (autocomplete lists every bundled Fluent UI Emoji). Leave it blank to fall back to the pile icon (house for home, city for outdoor).
5. Click **Save**.

### Edit or delete a card

Use the **Edit** or **Delete** buttons next to any card. Deleting a card also removes it from every user's banned list, and the history entries that reference it remain but are labelled as pointing to a removed card.

## Deck maintenance

The Cards tab also exposes a **Deck maintenance** block with three operations for bulk work on the deck.

### Export a backup

The **Export a backup** button downloads the full live deck as a ZIP file named `couplecards-deck-YYYY-MM-DD.zip`. The archive contains one `cards.<locale>.json` per supported language, each pretty-printed (two-space indentation) so the files stay easy to read, diff and hand-edit. The format is identical to the seed files under `data/`, which means an export can be placed back under `data/` to become the new starting point for fresh installs.

### Synchronise from the files on the server

The **Sync from the files** button reads every `cards.<locale>.json` present under the server's `data/` directory and applies them to the database in one operation. Use it after pulling new cards into the repository, or after hand-editing the files on the server.

The dialog offers two modes.

- **Add and update** (default). New cards found in the files are inserted, existing cards with the same ID have their text updated, and any card present only in the database is kept as is. Use this mode when the admin has added bespoke cards through the UI that should survive.
- **Full mirror.** The database becomes an exact copy of the file set. Cards that are present in the database but missing from every file are deleted, along with the ban rows that pointed to them. Use this mode when the files are the authoritative source.

The dialog requires a preview before the **Apply sync** button becomes active. The preview shows how many cards will be added, updated, removed or left unchanged, which makes accidental deletions impossible to miss. When the preview reports any removal the **Apply sync** button turns red so a destructive operation is hard to fire by reflex. A **Download a backup** shortcut sits in the same dialog so the current deck can be saved in one click before applying.

### Import a backup

The **Import a backup** button opens a file picker. Select a ZIP previously produced by the Export button (or any archive that contains `cards.<locale>.json` files) and apply it with the mode of your choice. A single JSON file in the seed format is also accepted as a legacy fallback and is treated as the English bucket. The preview step is mandatory here as well.

Every sync or import runs inside a single database transaction, so a failure midway leaves the deck untouched. The history table is never affected by a deletion: entries that reference a removed card keep their reference and are labelled as pointing to a removed card in the history view.

## The shared demo account

Couplecards can seed an extra shared account named `demo` with the password `demo`, so visitors can try the app without touching the couple's data. This account is disabled by default and must be enabled explicitly at deploy time by setting the `ENABLE_DEMO_ACCOUNT=1` environment variable. See [configuration.md](./configuration.md) for the complete variable reference.

What the demo account can do:

- Sign in with `demo` as the username and `demo` as the password.
- Draw cards, return or ban them, browse the history, and restore bans.

What is deliberately restricted to keep it safe:

- The role is fixed to `user`, so there is no admin visibility and no way to create other users or manage cards.
- The password cannot be changed. It must stay `demo` for the next visitor.
- The username cannot be renamed, the admin cannot reset its password through the UI, and the delete button is blocked on the demo row too.
- The bans and history of the demo user are wiped at every sign-in. Anything a visitor does disappears the next time someone signs in as `demo`, so nothing persistent leaks across sessions.
- A persistent banner is displayed inside the app for as long as the demo user is signed in.
- The name `demo` is reserved, so no other account can be created with that username.

Because a well-known credential exists while the flag is on, only enable the demo account on public demo instances. Never enable it on a private couple deployment. To disable it, remove the environment variable (or set it to `0`) and restart: the demo row is removed automatically at the next boot. The admin panel does not expose a delete button for the demo account, so the env var is the single lever.

## Changing the default language

Each user picks their own language on the settings screen, and the backend stores the preference per user. The admin account has its own language selector in the **Settings** tab of `/admin.html` (alongside the logout button), so the admin UI can be flipped between any supported locale without going through a player account or editing the database.

There is no instance-wide default beyond the initial locale detected at first boot. That initial value is set by the `SEED_LOCALE` environment variable (see [configuration.md](./configuration.md)). It is applied to the admin account at creation time and becomes the default for any user account seeded afterwards, until the user changes it.

The card deck itself is multilingual and always returns every available translation on `GET /api/cards`. The admin card list follows the active UI language and falls back to English when a card has no translation in that language. The edit dialog always exposes one text block per supported language so translations can be filled in or corrected in one go.
