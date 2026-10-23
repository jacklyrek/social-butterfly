# 🦋 Social Butterfly

A tiny PWA for friends: add submissions to shared pools (questions, things to do, …) and hit **Draw** to get a random one when conversation runs dry.

- Anyone with the link can add pools, add submissions, and draw.
- Drawn items are greyed out so you don't get repeats until everything has been drawn (or you put them all back).
- Installable on phones: open the link, then "Add to Home Screen".

## 1. Set up the shared database (Firebase, free, ~5 min)

Without this the app runs in **local mode** (data only lives on your device).

1. Go to <https://console.firebase.google.com> → **Add project** (Analytics can be off).
2. In the project: **Build → Firestore Database → Create database**. Pick a location, start in **test mode**.
3. Go to the **Rules** tab and replace them with this, then **Publish** (test mode rules expire after 30 days, these don't):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
   This means anyone with your project config can read/write. Fine for a friends-only toy, not for anything private.
4. **Project settings (⚙️) → General → Your apps → Web (`</>`)**. Register an app (no hosting needed) and copy the `firebaseConfig` object.
5. Paste it into [`firebase-config.js`](firebase-config.js):
   ```js
   export const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     appId: "...",
   };
   ```

## 2. Host on GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After a minute it's live at `https://<your-username>.github.io/<repo-name>/`. Share that link.

## Run locally

Any static server works, e.g.:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | UI |
| `app.js` | Screens, drawing logic |
| `store.js` | Data layer: Firestore when configured, localStorage otherwise |
| `firebase-config.js` | Your Firebase config |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA bits (offline + installable) |
