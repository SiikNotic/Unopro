# Google Play

The same app ships two ways, from the same code:

| | Direct APK (tests, GitHub Releases) | Google Play bundle |
|---|---|---|
| Gradle flavor | `direct` | `play` |
| Output | `carta.apk` | `carta-play-<version>.aab` |
| Web build | normal | `VITE_DISTRIBUTION=play` |
| Updates | the app's own updater (`AppUpdaterPlugin`) | Google Play only |
| `REQUEST_INSTALL_PACKAGES` | yes | removed (`src/play/AndroidManifest.xml`) |

## Building the bundle

The workflow **Android app (APK)** builds both on every push that changes the app (also by hand: Actions →
Android app (APK) → Run workflow). The bundle is the run artifact **carta-play-aab**. Nothing is sent to Google.

The `play-bundle` job:

1. builds the web app with `VITE_DISTRIBUTION=play` and runs `npx cap sync android`;
2. runs `./gradlew bundlePlayRelease`, signed with the release key from GitHub Secrets;
3. checks that the bundle is signed, prints the certificate (the upload key Google Play will show), runs
   `bundletool validate`, prints the manifest (package, versions, SDKs, permissions, AdMob App ID) and fails if
   `REQUEST_INSTALL_PACKAGES` is present.

**Version:** the same as the APK of the same run (`app-release.json` base + run number; 1.2.0 + run 45 =
1.2.45, versionCode 10245). Every run is higher than the last one, as Google Play requires.

## Signing

- **The key:** a Java keystore with the alias `carta`. It lives only in GitHub Secrets (`ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`), never in the repository. Keep a copy of the keystore file and its password
  somewhere safe outside GitHub: every update must be signed with it.
- **Google Play App Signing:** Play re-signs the app for users. On the first upload, Play Console asks how:
  - *Let Google create the app signing key:* the bundle's key becomes the **upload key**. Apps installed from
    Play are then signed by Google's key, so they can't be updated with the direct APK (and vice versa): a
    player switching between them has to uninstall first.
  - *Use your own key:* upload this same `carta` key as the app signing key (Play Console gives the tool and
    the steps). Play and direct installs then share one signature.

## Updates in the Play build

The Play build doesn't include the updater: `MainActivity` doesn't register `AppUpdaterPlugin` in the `play`
flavor, the update dialog doesn't run when `VITE_DISTRIBUTION=play`, and the install permission is removed.
Google Play updates it. The direct APK keeps its updater for tests and for players outside Play.
