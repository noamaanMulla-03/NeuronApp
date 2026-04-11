# NeuronApp: The AI Personal Assistant

NeuronApp is a React Native mobile application designed to be your proactive, intelligent personal assistant. Instead of just a generic chatbot, NeuronApp integrates deeply with your Google Workspace (GSuite) to understand your schedule, your communications, and your documents, offering personalized insights, autonomous task management, and semantic recall of your data.

It is built around the **"Cognitive Sanctuary"** design system—a sophisticated, tonally deep UI that prioritizes focus and proactively manages your cognitive load.

---

## 🚀 Core Capabilities

### 1. Unified Google Workspace Synchronization
NeuronApp acts as a central hub, extracting deep context from your digital life:
- **Calendar:** RSVP status, meeting links, and conflict detection.
- **Gmail:** Importance markers, categorizations, and communication history.
- **Drive & Docs:** Folder hierarchies and unresolved actionable comments.
- **Contacts:** Deep relationships and biographical notes.
- **Tasks, Keep & Chat:** Comprehensive daily tracking and note synchronization.

### 2. Semantic Memory (RAG) - *In Development*
Say goodbye to rigid keyword searches. NeuronApp uses **Firestore Vector Search** and **Vertex AI embeddings (`text-embedding-004`)** to index your digital life. You can ask natural language questions like, "What did John say about the Q3 roadmap last month?" and the AI will synthesize an answer grounded in your emails, docs, and notes.

### 3. Proactive Intelligence - *In Development*
Powered by **Firebase Genkit** and **Gemini 1.5 Flash/Pro**, NeuronApp transforms from a passive tool to an active agent:
- **Daily Briefing:** A synthesized morning narrative of your priorities, conflicting meetings, and urgent emails.
- **Autonomous Agenda Balancing:** The AI detects meeting-heavy days and proactively suggests rescheduling internal syncs to protect your Deep Work time.
- **Contextual Task Management:** Extracts implicit commitments from outgoing emails (e.g., "I'll review this by Friday") and automatically creates Google Tasks linked to the relevant documents.
- **Ghostwriter Agent:** Drafts replies and new documents matching your unique writing style, learned from your historical sent emails.

---

## 🛠️ Tech Stack & Architecture

NeuronApp heavily leverages the Google Cloud and Firebase ecosystems for a robust, scalable, and secure AI architecture.

### Mobile Frontend
- **Framework:** React Native (TypeScript)
- **Design System:** Custom "Cognitive Sanctuary" (Tonalism, Asymmetry, Manrope/Inter typography)
- **State Management:** Zustand (`authStore`, `gsuiteStore`)

### Backend & AI Orchestration (Firebase)
- **Compute:** Firebase Cloud Functions (Gen 2) & Cloud Scheduler
- **Database:** Cloud Firestore (Document Storage) & Firestore Vector Search (Semantic Memory)
- **AI Orchestration:** Firebase Genkit
- **LLMs & Embeddings:** Gemini 1.5 Pro (Reasoning & Analysis), Gemini 1.5 Flash (Fast Generation), Vertex AI `text-embedding-004`
- **Authentication:** Firebase Auth
- **Push Notifications:** Firebase Cloud Messaging (FCM)

---

## 📖 Getting Started

### Prerequisites
- Node.js (v22+ recommended for Cloud Functions)
- React Native environment setup (Android Studio / Xcode)
- Firebase CLI installed globally (`npm install -g firebase-tools`)

### 1. Clone & Install
```sh
git clone https://github.com/your-org/NeuronApp.git
cd NeuronApp
npm install
```

### 2. Firebase Setup
You must connect the app to a Firebase project with the necessary APIs enabled (Firestore, Functions, Vertex AI, Google Workspace APIs).
```sh
# Login to Firebase
firebase login

# Set your active project
firebase use --add
```

Deploy the backend services:
```sh
cd functions
npm install
npm run deploy
cd ..
```

### 3. Run the App
Start the Metro bundler:
```sh
npm start
```

Run on your connected device or emulator:
```sh
# For Android
npm run android

# For iOS
npm run ios
```
*(Note: We recommend running the Android build directly from Android Studio to a physical device for the best performance and debugging experience).*

---

## 🗺️ Roadmap & Contributing

NeuronApp is rapidly evolving. We are currently transitioning from our Phase 1 (Data Synchronization) into Phase 2 (Proactive Intelligence & Semantic Memory).

For a detailed breakdown of upcoming features, technical blueprints, and the architecture of our AI agents, please refer to the [ROADMAP.md](./ROADMAP.md) file.

---

## 🎨 Design Philosophy: The Cognitive Sanctuary
Our UI is rooted in soft surgical white (`#F8F9FA`) with high-contrast `Neuron Blue` (`#1A73E8`) accents. We follow the "No-Line" rule—boundaries are defined through background color shifts rather than harsh borders, creating a calm, focused environment for the user. See `GEMINI.md` and the `src/theme` directory for implementation details.