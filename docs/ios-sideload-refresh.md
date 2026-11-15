# iOS sideload — keeping the app alive

Teftera is distributed to iPhone **without a paid Apple Developer account**. That
means the app is signed with a free Apple ID ("Personal Team") development
certificate, and iOS enforces a hard **7-day signature lifetime**. On day 8 the
app stops launching — it is not a crash, a bug, or a licence problem, and no
data is lost (everything lives in Supabase).

This document is the runbook for keeping that signature fresh.

---

## The failure we keep hitting

The original setup was **AltStore Classic + AltServer on Windows**. AltServer is
supposed to re-sign silently over Wi-Fi, but on Windows it has a well-known dead
spot: Apple Mobile Device Service **loses track of the iPhone while the phone is
locked**, so the background refresh never fires. Combine that with the PC
sleeping overnight and the 7-day window closes unnoticed.

Symptom: the app icon is still on the home screen, tapping it flashes and
returns to the springboard, or iOS shows *"Unable to Verify App"*.

---

## Emergency fix — the app is already dead

1. Start **AltServer** on the Windows PC (tray icon).
2. Put the iPhone on the **same Wi-Fi**, and **unlock it** — keep the screen on.
3. iPhone → **AltStore → My Apps → Refresh All**.
4. If prompted, re-enter the Apple ID, then trust the profile at
   *Settings → General → VPN & Device Management*.

If AltStore reports the app is gone, or refresh fails outright, the `.ipa` has
to be reinstalled. **EAS deletes free-tier build artifacts after 30 days**, so
the old build link is probably dead — produce a fresh one:

```bash
eas build --platform ios --profile preview
```

Signing credentials are cached by EAS, so this should not need another
interactive Apple login. Install the resulting `.ipa` through AltStore.

---

## Permanent fix — migrate to SideStore

**This is the recommended path.** SideStore is a free AltStore fork that removes
the PC from the loop entirely. It resigns on-device using a bundled WireGuard
loopback VPN, so it refreshes the 7-day certificate **by itself, in the
background, with no computer and no shared Wi-Fi**. The 7-day limit still
exists — but nothing human has to happen when it comes around.

A computer is needed **once**, for the initial pairing, and never again.

- Setup guide: <https://docs.sidestore.io>
- Releases: <https://github.com/SideStore/SideStore/releases>

Trade-off worth knowing: SideStore's on-device refresh depends on its VPN
profile staying enabled, and each new iOS major version tends to need a
SideStore update before refresh works again. Check the releases page after any
big iOS upgrade.

---

## If staying on AltStore Classic

Harden it as much as Windows allows:

- **Autostart AltServer.** Put a shortcut in
  `shell:startup` so it survives every reboot.
- **Stop the PC sleeping.** *Settings → System → Power → Screen and sleep* →
  set sleep to **Never** while on mains. A sleeping AltServer refreshes nothing.
- **Enable Background App Refresh** for AltStore on the iPhone
  (*Settings → General → Background App Refresh*).
- **Open AltStore by hand every few days.** iOS deprioritises background refresh
  for apps that are never launched.
- **Refresh on day 5, not day 7.** Leave slack for a failed attempt.

### Personal Team limits (free Apple ID)

These bite unexpectedly:

| Limit | Value |
|---|---|
| Signature lifetime | 7 days |
| Sideloaded apps per Apple ID | 3 at a time |
| New App IDs per 7 days | 10 |

Registering too many App IDs in a week locks out *all* refreshes until the
window rolls — another reason not to reinstall repeatedly while debugging.

---

## The escape hatch

If this ever becomes more trouble than it's worth, the Apple Developer Program
($99/yr) replaces all of the above with TestFlight: 90-day builds, over-the-air
auto-update, no cable and no refresh ritual. That breaks the project's
zero-running-cost rule, so it stays a deliberate decision rather than a default.
