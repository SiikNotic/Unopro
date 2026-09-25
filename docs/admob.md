# AdMob (Android app)

AdMob only serves ads inside mobile apps, so the rewarded ad of the Bank works in the **Android app**
(`android/`, built with Capacitor from the same web build). The website keeps "Publicidad no disponible".

## How a reward is paid

1. The player taps "Ver anuncio" in the app. The app loads a rewarded ad with the player's user id as
   the SSV user id (`src/bank/admobProvider.ts`).
2. When Google considers the reward earned, **Google's servers** call
   `https://mdwkigzorhvktgqlffck.supabase.co/functions/v1/admob-ssv?…&signature=…&key_id=…`.
3. The `admob-ssv` function (`src/bank/server/admobSsv.ts`) checks the ECDSA signature with Google's
   public keys and calls `bank_grant_ad_reward(user, 'admob', transaction_id)`: +100 coins, once per
   transaction id, only for registered, non-banned accounts, at most 20 per day.
4. The app waits for the server to record the reward and only then shows it.

The app itself never grants coins. Without a valid Google signature nothing is paid.

## Configuration (public values, GitHub repository Variables)

| Variable | Example | Used for |
| --- | --- | --- |
| `ADMOB_APP_ID` | `ca-app-pub-1234567890123456~1234567890` | AndroidManifest (App ID) |
| `VITE_ADMOB_REWARDED_ID` | `ca-app-pub-1234567890123456/1234567890` | the rewarded ad unit |

Without them the build uses Google's sample IDs: test ads that never pay (Google sends no SSV callback
for the sample ad unit).

Optional Supabase Edge Function secret: `ADMOB_AD_UNIT` = the number after "/" of the ad unit id, to
accept callbacks only for that ad unit.

## Building

The workflow **Android app (APK)** builds `carta.apk` on every push that touches the app and attaches it
to the run (Actions → the run → Artifacts): signed with the release key when the secrets exist, a debug
build otherwise. New versions are published as GitHub Releases (see "In-app updates").

## Known limits of the app

- The app serves its files under `https://siiknotic.github.io` (Capacitor `server.hostname`) so the game
  servers accept it like the website.

## Sign-in inside the app

Supabase sends every sign-in link (email confirmation, Google, Discord, password reset) back to
`io.github.siiknotic.carta://auth`, which Android opens in the app (intent filter in `AndroidManifest.xml`).
Google and Discord open in the system browser (Google refuses sign-in inside embedded views). That address
must be listed in Supabase → Authentication → URL Configuration → Redirect URLs.

## In-app updates (outside Google Play)

- `app-release.json` holds the version and its notes (ES/EN). Bumping the version and pushing publishes it.
- The workflow signs the APK with the release key (GitHub Secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`; alias `carta`) and creates the GitHub Release `v<version>` with `carta.apk`
  and `update.json` (versionCode, notes, APK URL, SHA-256).
- The app (`src/app/UpdateDialog.tsx` + the native `AppUpdaterPlugin`) checks the latest release at start and
  every 6 hours, shows the version and its notes, downloads the APK only from this project's releases,
  checks its SHA-256 and opens Android's installer. Android refuses an update not signed with the same key
  and always asks the player to confirm. After updating, the app shows once what the version brought.
- Google Play does not allow apps to update themselves: a Play build must drop the updater (and the
  `REQUEST_INSTALL_PACKAGES` permission) and use Play's updates instead.
