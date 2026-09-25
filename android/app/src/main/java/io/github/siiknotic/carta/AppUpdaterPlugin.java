package io.github.siiknotic.carta;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Updates the app from the project's GitHub Releases (outside Google Play).
 *
 * - check(): reads update.json of the latest release (fixed URL below).
 * - downloadAndInstall(): downloads the APK, only from this project's releases, checks its SHA-256 against
 *   update.json and opens Android's installer. Android itself refuses the update unless it is signed with the
 *   same key as the installed app, and always asks the player to confirm.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String MANIFEST_URL = "https://github.com/SiikNotic/Unopro/releases/latest/download/update.json";
    private static final String ALLOWED_PREFIX = "https://github.com/SiikNotic/Unopro/releases/download/";
    private static final int MAX_MANIFEST_BYTES = 64 * 1024;
    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;

    @PluginMethod
    public void current(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            JSObject ret = new JSObject();
            ret.put("versionCode", code);
            ret.put("versionName", info.versionName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("version_unavailable", e);
        }
    }

    @PluginMethod
    public void check(PluginCall call) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = open(MANIFEST_URL);
                int status = conn.getResponseCode();
                if (status == 404) {
                    call.resolve(new JSObject());
                    return;
                }
                if (status != 200) {
                    call.reject("http_" + status);
                    return;
                }
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = conn.getInputStream()) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        if (out.size() > MAX_MANIFEST_BYTES) {
                            call.reject("manifest_too_large");
                            return;
                        }
                    }
                }
                JSObject ret = new JSObject();
                ret.put("manifest", new String(out.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("network", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        String sha256 = call.getString("sha256", "");
        if (url == null || !url.startsWith(ALLOWED_PREFIX) || !url.endsWith(".apk") || sha256 == null || !sha256.matches("^[0-9a-f]{64}$")) {
            call.reject("invalid_update");
            return;
        }
        // Android 8+: the player must allow this app to install updates (once).
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("install_permission");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            File dir = new File(getContext().getCacheDir(), "updates");
            File apk = new File(dir, "carta-update.apk");
            try {
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("no_cache_dir");
                conn = open(url);
                if (conn.getResponseCode() != 200) {
                    call.reject("http_" + conn.getResponseCode());
                    return;
                }
                long total = conn.getContentLengthLong();
                if (total > MAX_APK_BYTES) {
                    call.reject("too_large");
                    return;
                }
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long done = 0;
                int lastPercent = -1;
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        digest.update(buf, 0, n);
                        done += n;
                        if (done > MAX_APK_BYTES) throw new Exception("too_large");
                        int percent = total > 0 ? (int) (done * 100 / total) : -1;
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject p = new JSObject();
                            p.put("percent", percent);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (!toHex(digest.digest()).equals(sha256)) {
                    apk.delete();
                    call.reject("checksum");
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception e) {
                apk.delete();
                call.reject("download_failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("Accept", "application/octet-stream, application/json");
        return conn;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
