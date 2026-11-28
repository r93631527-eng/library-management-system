# LibraAI - Department Digital Library

LibraAI is a responsive React and Vite website with a Node.js HTTP API and SQLite database. It supports a student experience and a librarian/administrator experience for books, digital study resources, circulation, notifications, reports, and Gemini-powered PDF summaries.

The application currently provides:

- Student and librarian sign-in and registration
- Passwords stored as scrypt hashes and opaque HttpOnly session cookies
- SQLite-backed accounts, books, circulation, resources, favourites, notifications, and settings
- A librarian setup flow and librarian password recovery codes
- Book search and filters by title, author, subject, category, and collection
- Student borrow requests with librarian approval or rejection
- Issued, due, overdue, returned, and complete borrowing history
- Configurable borrowing period and maximum active loans
- Librarian management of books, students, librarians, categories, subjects, and settings
- Resource sections for E-Books, Question Papers, Video Lectures, Study Notes, PPTs, Lab Manuals, and Websites
- PDF, DOC, DOCX, PPT, PPTX, ODT, ODP, RTF, and TXT uploads up to 35 MiB
- Video links and external learning websites
- Department-restricted resources
- Optional LibreOffice conversion of Office documents to PDF for in-app preview
- An authenticated, responsive PDF viewer with fit, zoom, page navigation, and full-screen controls
- Downloads that retain the original uploaded file
- Resource favourites, recent-resource activity, resource issue reports, and announcements
- Circulation reports and CSV export
- Gemini AI PDF summarization, including study explanations, key topics, definitions, formulas, revision notes, exam questions, and chapter summaries
- Light/dark theme support
- PWA installation support and automatic service-worker updates

## Requirements

Install these tools before starting the project:

1. **Node.js 22.12 or newer**
2. **npm**, included with Node.js
3. **LibreOffice** only if Office files will be converted to PDF previews
4. **Git** for saving and uploading the project to GitHub
5. Optional: a modern mobile browser for PWA installation

Check the main tools:

```bash
node --version
npm --version
git --version
```

## Where the project is

This README is inside the application directory:

```text
C:\Users\Admin\Downloads\library management system\library management system
```

Open a terminal in that directory. If you use the parent workspace package scripts, it forwards commands to this application directory.

### Parent folder

| Path | Purpose |
|---|---|
| `package.json` | Workspace-level shortcuts for the web application |
| `package-lock.json` | Parent npm dependency lock |

LibraAI is a web/PWA application with no native Android or TWA wrapper.

### Application folder

| Path | Purpose |
|---|---|
| `package.json` | Vite, React, API, test, lint, build, and PWA scripts |
| `server/index.js` | SQLite database, authentication, API, uploads, file delivery, circulation, and Gemini integration |
| `server/dev.js` | Starts the API and Vite development server together |
| `server/index.test.js` | API tests |
| `src/main.jsx` | React entry point |
| `src/App.jsx` | Browser routes and protected student/librarian routes |
| `src/components/Layout.jsx` | Shared layout, navigation, dialogs, and UI components |
| `src/context/AppProvider.jsx` | Session, database refresh, theme, favourites, and app state |
| `src/services/api.js` | Frontend API requests and uploads |
| `src/pages/AuthPages.jsx` | Welcome, role selection, login, registration, setup, and recovery |
| `src/pages/AdminPages.jsx` | Librarian dashboard, books, resources, students, reports, settings, and notifications |
| `src/pages/StudentPages.jsx` | Student dashboard, search, catalog, loans, resources, PDF viewer, and AI summarizer |
| `src/resourceCategories.js` | Digital resource category definitions |
| `public/` | PWA icons, SVG, and any public static files |
| `scripts/generate-icons.mjs` | Generates PNG icons from `public/libraai-icon.svg` |
| `vite.config.js` | Vite server, API proxy, PWA manifest, and service-worker settings |
| `index.html` | Browser HTML, PWA links, theme colour, and app title |
| `Dockerfile` | Railway/container production image and LibreOffice installation |
| `railway.toml` | Railway Docker builder and `/api/health` health check |
| `data/libraai.sqlite` | Existing SQLite database, ignored by Git |
| `data/uploads/` | Uploaded resource files, ignored by Git |
| `.env` | Optional local private environment variables, ignored by Git |
| `dist/` | Generated production website, ignored by Git |
| `dev-dist/` | Generated development PWA files, ignored by Git |

## Install dependencies

From the application directory:

```bash
cd "C:\Users\Admin\Downloads\library management system\library management system"
npm install
```

From the parent folder, installation can also be run at the top level:

```bash
cd "C:\Users\Admin\Downloads\library management system"
npm install
```

If a lock file is already present, `npm ci` is preferable for a clean reproducible install:

```bash
npm ci
```

## Run the website locally

### Recommended: run both services

From the application directory:

```bash
npm run dev
```

This starts:

- The Node API at `http://localhost:3001`
- The Vite website at `http://localhost:5173`

Open `http://localhost:5173`.

To stop the application, press `Ctrl+C` in the terminal.

### Run the frontend and API separately

Use two terminals in the application directory:

```bash
terminal 1: npm run api
terminal 2: npm run dev:frontend
```

The Vite server proxies `/api` requests to the API on port 3001. If `API_PORT` changes, the proxy also uses that value.

### Run from the parent folder

These workspace shortcuts are available:

```bash
npm run dev
npm run api
npm run build
npm run lint
npm run test:api
```

## First account and local database

On a new database, open Librarian sign-in and use the librarian setup or account-creation flow. The first librarian account is created through the **Set up your librarian account** screen or **Librarian > Create librarian account**.

The API creates `data/libraai.sqlite` automatically. Uploaded resources are stored in `data/uploads/`.

SQLite is shared by the frontend and API through the backend. Existing accounts, books, resources, issue history, notifications, and favourites in the browser's old `localStorage` version are not imported automatically. They must be backed up or re-entered.

## Librarian features

- Add, search, edit, and delete physical books
- Track copies, access status, rack/shelf location, and collection data
- Approve or reject student borrow requests
- Record issue and return dates
- Identify overdue loans
- Manage registered students and librarian accounts
- Create recovery codes for librarian password resets
- Manage categories and subjects
- Publish announcements
- Configure the borrowing period and loan limit
- Upload and edit digital resources
- Replace an existing managed resource file
- Control department-restricted access
- Export circulation data as CSV

## Student features

- Register and sign in
- Browse and filter physical books
- Save books as favourites
- Request available books
- View pending, approved, rejected, overdue, returned, and complete borrowing history
- Search across books and digital resources
- Filter resources by category, department, semester, subject, year, and type
- Save resources as favourites
- View recently accessed resources
- Open PDF, Office-preview, and text resources
- Download original resources
- Open video and external learning links
- Report a resource problem
- Summarize library PDFs or upload PDFs for Gemini AI
- Copy or download generated summaries as Markdown

## Digital resources and LibreOffice

Managed uploads accept PDF, DOC, DOCX, PPT, PPTX, ODT, ODP, RTF, and TXT. A resource file is limited to 35 MB.

PDF and Office previews use the API. Original uploads remain unchanged and can be downloaded.

LibreOffice is required for an Office preview or conversion. Windows users can install LibreOffice and make sure `soffice` is on `PATH`. Alternatively, set:

```dotenv
LIBREOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe
```

The deployed Docker image in this project installs LibreOffice.

## Gemini AI configuration

Create a local `.env` file in the application directory:

```dotenv
GEMINI_API_KEY=your-Gemini-API-key
```

The API loads `.env` at startup. Existing process environment variables take precedence. Restart the API after adding or changing the key.

Gemini 3.5 Flash-Lite is the preferred model. The server checks that it is available for `generateContent` before use. `GEMINI_MODEL` is an optional fallback if the preferred model is unavailable:

```dotenv
GEMINI_MODEL=gemini-3.5-flash-lite
```

PDF summary generation allows up to 10 minutes for a Gemini response; the API server does not apply an idle response timeout. On Railway or another deployed server, add `GEMINI_API_KEY` and, if needed, the optional fallback model as server environment variables. Never put a secret in `VITE_*`, frontend source, screenshots, public code, or `public/`.

Uploaded PDFs used only for temporary summarization are processed for that request and are not added to the library. Generated summaries are not saved to SQLite.

## Email notifications

The API can send welcome, PDF upload, summary completion, and new library PDF notifications through Gmail SMTP. Email delivery runs in the background; mail failures are logged and do not interrupt registration, uploads, or summarization. New library PDF emails go to active students who can access that resource.

Add these server-only variables in Railway:

```dotenv
GMAIL_USER=your-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your-16-character-google-app-password
```

Enable 2-Step Verification on the Google account, then create an App Password in your Google Account security settings and use it as `GMAIL_APP_PASSWORD`. Do not use your regular Gmail password or expose either variable in frontend settings, `VITE_*` variables, or source code. Email notifications remain disabled until both variables are configured.

### Automatic overdue loan reminders

The API process checks active issued book loans every 15 minutes and sends one overdue email to the student's current registered email. It uses the existing `borrow_records.due_date` and `settings` table to track sent reminders; no new due-date field or table is added. Dates follow the app's existing UTC calendar-day logic: a loan is overdue after its due-date day has passed. The scheduler starts with the API process used by the Railway Docker deployment and runs independently of student sessions or the website being open. SMTP delivery failures are logged and retried on a later check.

## Server environment settings

| Variable | Default | Purpose |
|---|---|---|
| `API_PORT` | `3001` | Node API port |
| `VITE_PORT` | `5173` | Vite development port |
| `LIBRAAI_DB_PATH` | `data/libraai.sqlite` | SQLite file location |
| `LIBRAAI_UPLOAD_DIR` | `data/uploads` | Uploaded resource location |
| `GEMINI_API_KEY` | Not set | Gemini API key |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Optional fallback Gemini model if the preferred model is unavailable |
| `GMAIL_USER` | Not set | Gmail address used by backend SMTP |
| `GMAIL_APP_PASSWORD` | Not set | Google App Password for backend SMTP |
| `LIBRAAI_ALLOWED_ORIGINS` | Not set | Comma-separated exact origins for cross-origin API access |
| `LIBRAAI_COOKIE_SAMESITE` | `Strict` | Set to `None` only for cross-site HTTPS |
| `VITE_API_BASE_URL` | Same origin | Frontend API base URL, build-time variable |
| `LIBREOFFICE_PATH` | `soffice` on `PATH` | LibreOffice executable |

For a separately hosted frontend and API:

1. Set `VITE_API_BASE_URL=https://your-api.example.com` before building.
2. Set `LIBRAAI_ALLOWED_ORIGINS=https://your-frontend.example.com` on the API.
3. Use HTTPS.
4. Only use `LIBRAAI_COOKIE_SAMESITE=None` for a genuinely cross-site deployment.

Do not use wildcard origins with credentialed sessions.

## Checks

From the application directory:

```bash
npm run test:api
npm run lint
npm run build
```

For a production-style local API serving the built website:

```bash
npm run build
npm start
```

Open `http://localhost:3001`.

## Saving and backing up the project

### Back up source code

The safest source-code backup is a GitHub repository. Generated folders, dependencies, data, uploads, and `.env` files are ignored:

```text
node_modules/
dist/
dev-dist/
data/
.env
.env.*
```

Do not commit passwords, API keys, the SQLite database, uploaded student resources, or private files.

### Back up the database and uploads

Stop the API before copying the live SQLite database. Then copy:

```text
data/libraai.sqlite
data/uploads/
```

Also copy `libraai.sqlite-shm` and `libraai.sqlite-wal` only if they exist and the server is stopped. For a complete known-good backup, archive the whole `data/` folder after stopping the server.

Example Windows command:

```powershell
$date = Get-Date -Format "yyyy-MM-dd-HHmm"
New-Item -ItemType Directory -Force "$HOME\LibraAI-backups\$date"
Copy-Item "C:\Users\Admin\Downloads\library management system\library management system\data\*" "$HOME\LibraAI-backups\$date\" -Recurse
```

Keep database backups and uploaded files together, and store them in a private location.

For Railway, back up the persistent volume through a volume-management or download process you control. Do not rely on Railway deployments or rebuilds as database backups.

## GitHub repository instructions

### Create or connect a repository

From the project root:

```bash
cd "C:\Users\Admin\Downloads\library management system"
git init
git branch -M main
git add .
git status
git commit -m "Create LibraAI digital library"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

If the repository is already initialized:

```bash
git status
git add .
git commit -m "Update LibraAI"
git push
```

If GitHub asks for authentication, use a GitHub account you control and a personal access token or GitHub sign-in flow; do not place the token in project files.

Before committing, verify:

```bash
git status
git check-ignore -v data/libraai.sqlite
git check-ignore -v data/uploads
git check-ignore -v .env
```

`git check-ignore` should identify the ignored path.

## Railway deployment

This project includes `railway.toml`, a Dockerfile, and the `/api/health` health route.

1. Push the project to GitHub.
2. In Railway, create a new project and select **Deploy from GitHub repo**.
3. Set the root directory/service source to:

```text
library management system
```

4. Confirm Railway detects `Dockerfile` and `railway.toml`.
5. Add server variables as secrets:
   - `GEMINI_API_KEY`
   - optional `GEMINI_MODEL`
   - `LIBRAAI_ALLOWED_ORIGINS` only if the frontend has a different origin
   - `VITE_API_BASE_URL` only for a separately hosted frontend
6. Add a persistent volume and mount it at:

```text
/app/data
```

7. Add:

```dotenv
LIBRAAI_DB_PATH=/app/data/libraai.sqlite
LIBRAAI_UPLOAD_DIR=/app/data/uploads
NODE_ENV=production
```

8. Deploy and open the Railway public domain.

The Docker image listens on port 3001 and serves both the built React website and API from the same origin. Use the Railway domain with HTTPS.

Railway's health check is `/api/health`.

After redeploying, verify:

```text
https://YOUR-RAILWAY-DOMAIN/api/health
```

It should return `{ "ok": true }`.

### Railway persistence

Without a persistent volume, database and upload changes can disappear or be replaced during redeployment. Use a volume mounted at `/app/data` and keep separate private backups.

### Cross-origin deployment

For this project, same-origin Railway deployment is the simplest and avoids API/CORS/cookie problems. If the frontend and API are separated, set exact origins and consider `LIBRAAI_COOKIE_SAMESITE=None`.

## PWA configuration

The PWA is configured in `vite.config.js` by `vite-plugin-pwa`.

It includes:

- App name: LibraAI - Department Digital Library
- Short name: LibraAI
- Standalone display
- Portrait-primary orientation
- Theme colour `#246b52`
- Background colour `#f5f7f4`
- 192 px, 512 px, and maskable 512 px icons
- Apple and general web app metadata
- Service-worker updates wait until existing app tabs are closed, preventing old app code from requesting assets removed by a new deployment
- Navigation fallback to `index.html`
- API `/api` requests configured as network-only

Build the PWA:

```bash
npm run build
```

The generated `dist/manifest.webmanifest` and service-worker assets can be served through Railway or another HTTPS host.

PWAs generally require HTTPS. `localhost` is accepted for local testing. Test in Chrome or Edge:

1. Open the deployed website.
2. Wait for it to load fully.
3. Open the browser install menu.
4. Select **Install app** or **Add to Home screen**.

To change the app name or colours, update `vite.config.js` and `index.html`, then rebuild and redeploy.

## Web and PWA installation

LibraAI is a web-only application. The Railway HTTPS website works directly in desktop and mobile browsers. Chrome or Edge users may optionally install it from the browser menu to a phone or desktop home screen.

This project has no native app, APK, or TWA configuration. Open and use the Railway HTTPS URL instead.
## Common errors

### `npm is not recognized`

Install Node.js 22 or newer, reopen the terminal, and run:

```bash
node --version
npm --version
```

### `Cannot find module`

Reinstall dependencies in the application directory:

```bash
cd "C:\Users\Admin\Downloads\library management system\library management system"
npm install
npm run dev
```

### Port 3001 or 5173 is already in use

Stop the old process or select different ports:

```powershell
$env:API_PORT="3002"
$env:VITE_PORT="5174"
npm run dev
```

The API and Vite proxy use the new API port.

### `Library server unavailable` or `Cannot reach the LibraAI API`

- Confirm `npm run dev` or `npm run api` is running.
- Open `http://localhost:3001/api/health`.
- Confirm `VITE_API_BASE_URL` is correct if using separate deployments.
- Confirm `LIBRAAI_ALLOWED_ORIGINS` exactly includes the frontend origin.
- Do not mix `http` and `https` origins unnecessarily.

### Login works locally but not after deployment

- Use HTTPS for Railway.
- Use same-origin hosting for the easiest cookie setup.
- For cross-origin hosting, set exact `LIBRAAI_ALLOWED_ORIGINS`.
- Set `LIBRAAI_COOKIE_SAMESITE=None` only for cross-site HTTPS.
- Check that browser cookie blocking is disabled for the service.
- The session cookie lasts seven days.

### Uploaded file fails or returns invalid file

- Confirm the file is smaller than 35 MiB.
- Confirm the extension and actual file format are supported.
- Confirm the file is not damaged.
- Check that `data/uploads/` exists and is writable.
- On Railway, confirm the persistent volume is mounted and `LIBRAAI_UPLOAD_DIR` is set correctly.

### Office preview fails

- Install LibreOffice.
- Confirm `soffice` is available on `PATH`, or set `LIBREOFFICE_PATH`.
- Restart the API after changing the setting.
- Confirm the Docker/Railway image includes LibreOffice.

### Gemini says it is not configured

- Set `GEMINI_API_KEY` in the API `.env` or deployment secrets.
- Restart or redeploy the API.
- Do not place the key in `VITE_*` or source code.
- Verify the key and model have access to Gemini Files API.

### PWA will not install

- Use HTTPS or `localhost`.
- Run `npm run build`.
- Confirm `manifest.webmanifest`, icons, and service-worker files are served.
- Clear old site data and reload once.
- Use Chrome or Edge for the simplest PWA test.

### Lost local database or uploads

- Restore `data/libraai.sqlite` and `data/uploads/` from a private backup.
- Stop the server before restoring SQLite files.
- Use the same deployment volume mount when restoring Railway data.
