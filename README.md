# NeuronApp: AI Personal Assistant

NeuronApp is a React Native mobile application that acts as a proactive, context-aware personal assistant. It integrates deeply with Google Workspace to understand your schedule, communications, documents, and tasks — then uses that context to provide semantic recall, daily intelligence briefings, and real-time background indexing.

Built around the **Cognitive Sanctuary** design system: tonally layered UI with no hard borders, asymmetric layout, and Manrope/Inter typography optimised for deep focus.

---

## Features

### Real-Time Google Workspace Sync

Eight Google services are synced automatically in the background without any user interaction after initial permission grant. Sync uses a hybrid push + polling architecture:
 
**Push-based (real-time):** 

- **Gmail** — Google pushes change notifications via Cloud Pub/Sub (`gmail-push` topic). Each notification triggers an incremental sync of new/modified messages. Extracts subject, sender, date, body, labels, importance markers, and category.
- **Google Drive** — HTTP webhook channel on the Drive Changes endpoint. On every file change, Drive metadata is synced and document content extraction is triggered automatically.
- **Google Calendar** — HTTP webhook channel on the primary calendar. Syncs all calendars and events including RSVP status, attendees, video links, and multi-calendar support with per-event timezone handling.

**Scheduled polling (every 15 minutes):**

- **Contacts** — Incremental sync via People API using sync tokens. Extracts name, emails, phones, organisations, biographical notes, and photo URL. On 410 (token expired), falls back to full sync.
- **Tasks** — All task lists with completion status, due dates (midnight UTC), parent/child relationships, and position ordering.
- **Google Keep** — Note titles and body text. Fails gracefully if the account lacks Workspace Enterprise access.
- **Google Chat** — Space metadata (DMs, group chats, named spaces).

**Watch renewal (every 6 hours):**
A scheduled function checks all active watch channels and renews any expiring within 12 hours. Gmail and Calendar watches expire after ~7 days; Drive watches after ~24 hours.

---

### Server-Side Token Management

The client never passes access tokens to sync functions. On first sign-in:

1. The React Native Google Sign-In SDK returns a `serverAuthCode` (available because `offlineAccess: true`).
2. The app sends this one-time code to the `storeRefreshToken` Cloud Function.
3. The backend exchanges it for a long-lived refresh token via the Google OAuth2 token endpoint and stores it at `users/{uid}/tokens/google` in Firestore (admin SDK only — clients are blocked by security rules).
4. Before every automated sync, the backend calls `refreshAccessTokenServer()` to obtain a fresh access token (~60 min lifetime) without any client involvement.

---

### Semantic Memory (RAG)

All synced documents are automatically embedded using **Vertex AI `text-embedding-004`** and stored as Firestore vector fields. Embeddings are generated asynchronously via a Cloud Tasks queue with retry on failure.

**Collections indexed:**

- `gmail_messages` — Email body prepended with `[Email]`, subject, sender, date
- `docs_content` — Document title, extracted plain text (Docs/Sheets/Slides exported via Drive API), and unresolved comments
- `keep_notes` — Note title and body
- `chat_messages` — Text content

**Semantic Chat** (`semanticChat` Cloud Function):

- Accepts a natural-language query (max 2,000 chars)
- Embeds the query once then retrieves the top 5 results from each of 4 collections in parallel
- Filters by cosine distance threshold of 0.65 (only semantically relevant documents pass)
- Builds typed context blocks with collection-specific headers and metadata
- Synthesises an answer using **Gemini 2.5 Flash** with a 30-second timeout
- Returns `{ answer: string, sources: string[] }` with human-readable citations (`Email: Subject — from sender`, `Document: Title`, etc.)

**Idempotency:** Firestore triggers skip re-embedding documents whose text content hasn't changed since the last embedding pass.

---

### Daily Briefing

A scheduled Cloud Function runs every hour and generates a personalised morning brief for each user once per day after 07:00 in their local timezone.

**Data aggregated (in parallel from Firestore, no Google API calls):**

- Today's calendar events (all-day and timed, filtered by IANA timezone)
- Pending tasks due today or overdue
- Important emails from the last 24 hours

**LLM synthesis:** Gemini 2.5 Flash produces a structured output validated by Zod:

```
greeting        — warm one-line greeting referencing the date
summary         — 2–3 sentence synthesis of the day's priorities
eventHighlights — up to 3 most important calendar items
priorityTasks   — up to 3 most urgent tasks
importantEmails — up to 3 emails needing attention
```

Idempotency: if a brief already exists for today (`users/{uid}/daily_briefings/YYYY-MM-DD`), the function skips that user. Per-user failures are isolated and logged without aborting the full fan-out.

---

### Authentication & Security

- **Google Sign-In** with Firebase Auth. Session persisted to device via `AsyncStorage` with Firebase's built-in token refresh.
- **Biometric gating** (Face ID / Touch ID / Android Biometrics): on first app launch after sign-in, the user must authenticate biometrically if enabled. Biometric state stored in Keychain (`react-native-keychain`).
- **Firestore security rules** enforce user-scoped access. `users/{uid}/tokens/**` and `watch_channels/**` are hard-blocked from client reads/writes (`allow read, write: if false`).
- OAuth scopes are read-only across all eight Google APIs.

---

## Architecture

```
Mobile App (React Native)
│
├── Sign-in → captures serverAuthCode → storeRefreshToken Cloud Function
│                                         └── stores refresh token in Firestore
│
├── Permission grant → savePermissions → triggerInitialSync Cloud Function
│                                           ├── syncs all enabled services (server-side)
│                                           └── sets up push watch channels
│
├── GSuiteStatus screen ─ onSnapshot(sync_meta/status) → real-time progress
│
└── SemanticChat screen → semanticChat Cloud Function → Gemini 2.5 Flash

Cloud Functions
│
├── onGmailPush (Pub/Sub)         ─┐
├── onCalendarPush (HTTP webhook)  ├── refresh token → sync → update sync_meta
├── onDrivePush (HTTP webhook)    ─┘
│
├── autoSyncPolled (cron: */15 * * * *)  — contacts, tasks, keep, chat
├── renewWatches   (cron: 0 */6 * * *)   — renews expiring watch channels
├── generateDailyBriefings (cron: 0 * * * *) — timezone-aware morning briefs
│
├── processEmbedding (Cloud Tasks queue)  — generates + stores vector embeddings
├── onDocsWrittenEmbed  ─┐
├── onGmailWrittenEmbed  ├── Firestore triggers → enqueue processEmbedding
├── onKeepWrittenEmbed  ─┘
│
└── semanticChat (callable)  — parallel vector retrieval + Gemini synthesis

Firestore Data Model
users/{uid}/
  tokens/google          — refresh token (admin SDK only)
  settings/
    timezone             — IANA timezone string (written on sign-in)
    gsuite_permissions   — per-service enabled booleans
  sync_meta/status       — real-time sync progress per service
  watches/               — active push channel metadata
  calendar_events/       — synced events
  calendar_calendars/    — calendar list
  gmail_messages/        — messages with embeddings
  drive_files/           — file metadata with folder paths
  docs_content/          — extracted document text with embeddings
  contacts_people/       — contact records
  tasks_items/           — tasks with list context
  tasks_lists/           — task list metadata
  keep_notes/            — note text with embeddings
  chat_spaces/           — Chat space metadata
  daily_briefings/       — one document per day (YYYY-MM-DD)

watch_channels/{channelId}   — channelId → {uid, service} reverse lookup
```

---

## Tech Stack

| Layer            | Technology                                      |
| ---------------- | ----------------------------------------------- |
| Mobile           | React Native 0.84.1 (TypeScript)                |
| State            | Zustand 5 (`authStore`, `gsuiteStore`)          |
| Forms            | react-hook-form + Zod                           |
| Navigation       | React Navigation v7 (native stack)              |
| Auth             | Firebase Auth 12 + Google Sign-In 16            |
| Biometric        | react-native-biometrics + react-native-keychain |
| Persistence      | @react-native-async-storage                     |
| Backend          | Firebase Cloud Functions v2 (Node 22)           |
| Database         | Cloud Firestore                                 |
| Vector Search    | Firestore Vector Search                         |
| AI Orchestration | Firebase Genkit 1.32                            |
| LLM              | Gemini 2.5 Flash (via Vertex AI)                |
| Embeddings       | Vertex AI `text-embedding-004`                  |
| Async Jobs       | Google Cloud Tasks                              |
| Push Sync        | Google Pub/Sub + HTTP webhook channels          |
| Secrets          | Firebase Secret Manager                         |

---

## Getting Started

### Prerequisites

- Node.js v22+
- React Native environment (Android Studio / Xcode)
- Firebase CLI: `npm install -g firebase-tools`
- `gcloud` CLI authenticated to the project

### 1. Clone & Install

```sh
git clone https://github.com/your-org/NeuronApp.git
cd NeuronApp
npm install
cd functions && npm install && cd ..
```

### 2. One-Time GCP Setup

```sh
# Store the OAuth web client secret
echo "YOUR_CLIENT_SECRET" | firebase functions:secrets:set GOOGLE_CLIENT_SECRET --project neuron-bb594

# Create the Gmail Pub/Sub topic
gcloud pubsub topics create gmail-push --project=neuron-bb594

# Grant Gmail push notifications permission to publish
gcloud pubsub topics add-iam-policy-binding gmail-push \
  --project=neuron-bb594 \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

### 3. Deploy Backend

```sh
cd functions
npm run deploy
cd ..

# Deploy Firestore security rules
firebase deploy --only firestore:rules --project neuron-bb594
```

### 4. Run the App

```sh
npm start        # Metro bundler
npm run android  # or open android/ in Android Studio
npm run ios      # or open ios/ in Xcode
```

---

## Design Philosophy: Cognitive Sanctuary

The UI is built around the concept of a focused, distraction-free mental workspace:

- **Palette:** Surgical white `#F8F9FA` base with Neuron Blue `#1A73E8` as the primary accent
- **No-Line Rule:** Boundaries defined by tonal background shifts rather than borders
- **Typography:** Manrope (headlines) and Inter (body) for high legibility at small sizes
- **Layout:** Asymmetric compositions with intentional whitespace to reduce cognitive load

See `src/theme/` and `Design/DESIGN.md` for the full token system.
