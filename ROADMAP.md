# NeuronApp: AI Personal Assistant Roadmap

This document outlines the strategic evolution of NeuronApp from a data synchronization tool into a fully agentic, personalized AI assistant.

---

## 🏗️ Core Pillars

### 1. Semantic Memory (RAG)
**Goal:** Enable the AI to "remember" and retrieve any information from synced GSuite data using natural language.
- **Technical Requirements:** 
    - Vector Database (e.g., Pinecone, Supabase Vector, or local `sqlite-vec`).
    - Embedding Model (e.g., Google's `text-embedding-004`).
    - Orchestration (e.g., LangChain or manual retrieval logic).
- **Phases:**
    1. **Indexing:** Create a background service to chunk and embed Docs, Gmail, and Drive metadata.
    2. **Retrieval:** Build a chat interface that queries the vector store to find relevant context.
    3. **Augmentation:** Pass retrieved context to an LLM for grounded answers.

### 2. Proactive Daily Briefing
**Goal:** Synthesize the day's priorities automatically every morning.
- **Technical Requirements:**
    - Cron-like scheduling (e.g., Firebase Cloud Functions or background tasks).
    - Multi-service analysis (Calendar + Tasks + Gmail).
- **Phases:**
    1. **Morning Scan:** Aggregate today's meetings, overdue tasks, and unread priority emails.
    2. **Synthesis:** Use an LLM to generate a 3-paragraph "Morning Brief" highlighting conflicts and urgent items.
    3. **Notification:** Deliver the brief via push notification at a user-specified time.

### 3. Ghostwriter Agent (Drafting & Replies)
**Goal:** Automate communication while maintaining the user's unique voice.
- **Technical Requirements:**
    - LLM Fine-tuning or few-shot prompting using "Sent" mail history.
    - Integration with Gmail/Docs writing APIs.
- **Phases:**
    1. **Style Profile:** Analyze the last 50 sent emails to determine tone, sign-offs, and brevity.
    2. **Smart Replies:** Offer three high-quality draft responses for every incoming email.
    3. **Drafting Agent:** Generate full documents or complex email responses based on short natural language instructions.

### 4. Contextual Task Management
**Goal:** Bridge the gap between "to-dos" and the actual work files.
- **Technical Requirements:**
    - Entity Extraction (LLM-based) to identify files/people mentioned in tasks.
    - Deep linking between Tasks and Firestore data.
- **Phases:**
    1. **Auto-linking:** When a task is created, search Drive/Gmail for related keywords and attach links.
    2. **Commitment Tracking:** Scan sent emails for "I'll do X by Y" and automatically create a Google Task.

---

## ⚡ Proactive Agentic Intelligence (New Priorities)

### 5. Autonomous Agenda Balancing
- **Feature:** The AI proactively identifies "meeting-heavy" days and suggests rescheduling low-priority internal syncs to protect Deep Work time *before* the day starts.
- **Proactive Signal:** High calendar density + looming deadlines in Tasks.

### 6. Information "Glue" (Auto-Workspace)
- **Feature:** The AI notices a new project emerging in Gmail threads and proactively creates a "Project Hub," grouping related Drive files, Contacts, and Calendar events without user input.
- **Proactive Signal:** Recurring keywords across multiple services.

### 7. Predictive Conflict Resolution
- **Feature:** The AI notices a task deadline is impossible due to travel time or meeting overlaps and proactively offers to negotiate a new time with the other party or alerts you with a solution.
- **Proactive Signal:** Calendar location data + Task due dates.

### 8. Inbox "Air Traffic Control"
- **Feature:** The AI proactively "snoozes" or archive-low-value notifications and newsletters based on your reading habits, surfacing only the "High Impact" communications to your notification tray.
- **Proactive Signal:** Low interaction rates with specific senders.

---

## 🛠️ Implementation Strategy

1.  **Phase A (Infrastructure):** Set up the Vector Database and the first "Sync-to-Vector" background process in `src/services/vector-sync.ts`.
2.  **Phase B (Interaction):** Implement a global "Chat" tab in `app/chat/index.tsx`.
3.  **Phase C (Proactivity):** Deploy Cloud Functions to trigger the "Daily Briefing" and "Agenda Balancing" engines.
4.  **Phase D (Agents):** Implement the "Ghostwriter" UI and "Commitment Tracker" logic.

---

## 📅 Integration Points in Current Codebase

- **`src/services/sync-engine.ts`**: The hook point for running Vector Indexing after a successful GSuite sync.
- **`src/store/gsuiteStore.ts`**: Add a new `aiStatus` state to track indexing progress.
- **`app/home/index.tsx`**: Add a "Daily Brief" card to the top of the home screen.
