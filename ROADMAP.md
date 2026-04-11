# NeuronApp: AI Personal Assistant Roadmap

This document outlines the strategic evolution of NeuronApp from a data synchronization tool into a fully agentic, personalized AI assistant. The architecture heavily prioritizes the Google Cloud and Firebase ecosystems, leveraging Firebase Genkit for AI orchestration, Vertex AI/Gemini for reasoning and embeddings, and Firestore for both document and vector storage.

---

## 🏗️ Core Pillars & Technical Architecture

### 1. Semantic Memory (RAG)
**Goal:** Enable the AI to "remember" and retrieve any information from synced GSuite data (Docs, Gmail, Drive, Keep, Chat, Calendar) using natural language.

**Technical Blueprint:**
*   **Vector Database:** **Firestore Vector Search**. Utilizing the native vector embedding support in Firestore allows us to store embeddings alongside the synchronized GSuite data without needing a separate database like Pinecone.
*   **Embedding Model:** **Vertex AI `text-embedding-004`**. Optimized for semantic retrieval.
*   **Orchestration:** **Firebase Genkit**. We will build Genkit flows for both the ingestion (chunking and embedding) and the retrieval (querying and synthesizing) pipelines.
*   **Implementation Phases:**
    1.  **Ingestion Pipeline (Cloud Functions):** Create a Genkit flow triggered by Firestore `onDocumentWritten` events in the synced data collections. When new Gmail or Docs data arrives, the flow chunks the text, calls the Vertex AI embedding model, and saves the vector field back to the Firestore document.
    2.  **Retrieval Flow (Genkit):** Build a Genkit flow that takes a user query, generates its embedding, and performs a nearest-neighbor vector search in Firestore.
    3.  **Synthesis (Gemini):** Pass the retrieved context to **Gemini 1.5 Flash** (via Genkit) to formulate a grounded, natural language response.

### 2. Proactive Daily Briefing
**Goal:** Synthesize the day's priorities automatically every morning, offering a tailored narrative of the day ahead.

**Technical Blueprint:**
*   **Trigger:** **Firebase Cloud Scheduler** (Cloud Functions Gen 2 `onSchedule`). Configured to run at the user's preferred morning time (e.g., 7:00 AM local time).
*   **Compute Engine:** **Firebase Cloud Functions** orchestrating a **Genkit Flow**.
*   **Reasoning Model:** **Gemini 1.5 Flash**. Fast and cost-effective for daily summarization.
*   **Implementation Phases:**
    1.  **Data Aggregation:** The Cloud Function fetches today's Calendar events, overdue Google Tasks, unread "Important" Gmail messages, and pending Docs comments from Firestore.
    2.  **LLM Synthesis:** The aggregated data is passed to a Genkit flow where a Gemini prompt is instructed to analyze conflicts (e.g., back-to-back meetings), highlight urgent communications, and generate a 3-paragraph "Morning Brief."
    3.  **Delivery:** The generated brief is saved to a `dailyBriefings` Firestore collection and pushed to the React Native app via **Firebase Cloud Messaging (FCM)**.

### 3. Ghostwriter Agent (Drafting & Replies)
**Goal:** Automate communication while maintaining the user's unique voice and formatting preferences.

**Technical Blueprint:**
*   **Analysis Model:** **Gemini 1.5 Pro** (large context window to analyze historical emails).
*   **Generation Model:** **Gemini 1.5 Flash** (for fast generation of replies).
*   **Implementation Phases:**
    1.  **Style Extraction (One-off/Periodic):** A background Cloud Function analyzes a batch of the user's "Sent" emails (fetched via the Gmail sync engine) using Gemini 1.5 Pro. It extracts a "Style Profile" (tone, common sign-offs, formatting quirks) and saves it to the user's `profile` in Firestore.
    2.  **Smart Reply Flow:** For incoming emails flagged as "Important", a Genkit flow generates three context-aware, style-aligned draft responses.
    3.  **Drafting Agent:** The React Native app exposes a Ghostwriter UI. The user provides a short instruction (e.g., "Tell them I can't make it but offer next Tuesday"). The app calls a Genkit flow via Firebase App Check, which injects the Style Profile and generates the full draft.

### 4. Contextual Task Management
**Goal:** Bridge the gap between "to-dos" and the actual work files, completely automating task creation from commitments.

**Technical Blueprint:**
*   **Entity Extraction:** **Gemini 1.5 Flash** with **Structured Outputs (JSON Schema)** via Genkit.
*   **Implementation Phases:**
    1.  **Commitment Tracking (Event-Driven):** When a new outgoing email or Chat message is synced to Firestore, an `onDocumentCreated` Cloud Function triggers a Genkit flow. The flow uses Gemini to extract any implicit commitments (e.g., "I'll review the doc by Friday"). If a commitment is found, it automatically creates a Google Task via the Google Tasks API.
    2.  **Semantic Auto-linking:** When a task is created (manually or automatically), a background process performs a semantic search (using the RAG Vector DB) for the entities mentioned in the task (e.g., "Review Q3 Report"). It then attaches the deep link of the relevant Google Doc directly to the task metadata.

---

## ⚡ Proactive Agentic Intelligence (Advanced Features)

### 5. Autonomous Agenda Balancing & Conflict Resolution
**Goal:** The AI proactively identifies "meeting-heavy" days, suggests rescheduling low-priority internal syncs to protect Deep Work, and flags impossible deadlines based on physics (e.g., travel time).

**Technical Blueprint:**
*   **Analysis Engine:** A specialized **Genkit Agent** leveraging **Gemini 1.5 Pro** for complex spatial and temporal reasoning.
*   **Implementation:**
    *   **Proactive Scan:** A nightly Cloud Scheduler function analyzes the next 3 days.
    *   **Rule Engine:** It calculates "Calendar Density." If density > 70%, it identifies "moveable" meetings (internal, 1-on-1s) and uses the Google Calendar API (Free/Busy endpoint) to find alternative slots for all attendees.
    *   **Resolution:** It pushes an interactive notification (via FCM) to the app: "Your Tuesday is packed. Do you want me to propose moving the 1:1 with John to Wednesday?"

### 6. Information "Glue" (Auto-Workspace)
**Goal:** The AI notices a new project emerging across disparate services and proactively creates a "Project Hub," grouping related Drive files, Contacts, Keep notes, and Calendar events.

**Technical Blueprint:**
*   **Clustering Algorithm:** **Vertex AI Vector Search** combined with **Gemini 1.5 Pro** for topic modeling.
*   **Implementation:**
    *   As data is ingested into the Vector DB, a background process runs a clustering analysis on recent communications and documents.
    *   When a cluster of high semantic similarity crosses a threshold, Gemini is prompted to name the project (e.g., "Project Phoenix Launch").
    *   A new `projectHub` document is created in Firestore, containing references to the clustered Gmail threads, Drive Docs, and Calendar events, which is immediately visible in the React Native UI.

### 7. Inbox "Air Traffic Control"
**Goal:** The AI proactively "snoozes" or archives low-value notifications, surfacing only "High Impact" communications.

**Technical Blueprint:**
*   **Classification:** **Genkit flow** running on every incoming email (via Gmail Push notifications/PubSub integration, or frequent polling).
*   **Implementation:**
    *   The app tracks the user's historical interaction rates with different senders/categories (stored in Firestore).
    *   A Genkit flow evaluates new emails against this interaction history and the user's current context (e.g., are they in a meeting?).
    *   Emails classified as "low-value" are automatically archived or moved to a "Read Later" label via the Gmail API, bypassing the device's notification tray completely.

---

## 📅 Execution Roadmap & Phasing

### Phase 1: The Semantic Foundation (RAG)
1.  Enable Firestore Vector Search on the Firebase Project.
2.  Implement `functions/src/services/vector-sync.ts`: A Genkit flow using `text-embedding-004` that triggers on Firestore writes to embed Docs, Gmail, and Keep notes.
3.  Build the `app/chat/index.tsx` UI and the backend Genkit retrieval flow to chat with the vector store.

### Phase 2: Proactive Intelligence
1.  Build the Daily Briefing engine using Cloud Scheduler and Gemini 1.5 Flash.
2.  Implement the Commitment Tracker: parse outgoing emails for promises and auto-create Google Tasks.

### Phase 3: The Ghostwriter & Agentic Actions
1.  Implement the Style Extraction pipeline.
2.  Build the Smart Reply and Drafting UI in the app.
3.  Develop the Autonomous Agenda Balancing agent to handle calendar conflicts and propose rescheduling.