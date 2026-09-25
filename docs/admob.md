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

The workflow **Android app (APK)** builds `app-debug.apk` on every push that touches the app and
attaches it to the run (Actions → the run → Artifacts). A Play Store release needs a signed release
build (upload key kept as a GitHub secret): not set up yet.

## Known limits of the app

- Google / Discord sign-in is hidden in the app (Google blocks sign-in inside embedded browsers); email
  and password work.
- The app serves its files under `https://siiknotic.github.io` (Capacitor `server.hostname`) so the game
  servers accept it like the website.
