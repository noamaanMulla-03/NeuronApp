# NeuronApp: AI Personal Assistant

NeuronApp is a React Native mobile application designed to integrate and synchronize data across various Google Workspace (GSuite) services. It has been redesigned using the **"Cognitive Sanctuary"** design system, prioritizing focus, tonal depth, and a proactive AI experience.

## Design System: The Cognitive Sanctuary

The application follows the **"Digital Architect"** Creative North Star:
- **Aesthetic:** Sophisticated Tonalism (asymmetry, expansive white space, tonal layering).
- **Palette:** Rooted in soft surgical white (`#F8F9FA`) with high-contrast `Neuron Blue` (`#1A73E8`) accents.
- **The "No-Line" Rule:** Boundaries are defined through background color shifts rather than 1px solid borders.
- **Typography:** Manrope for architectural headlines, Inter for clinical body legibility.

## Project Structure

- `app/`: Redesigned UI screens following the new design system.
    - `auth/`: Clean, secure onboarding experience.
    - `home/`: Proactive Assistant Hub (Daily Briefing, Project Hubs, Semantic Search).
- `src/theme/`: Centralized theme configuration (Colors, Typography, Spacing).
- `src/components/`: Tonal-depth-aware UI components (Button, Input, Card).
- `src/services/`: Core logic for GSuite synchronization and AI-driven insights.

## Development Status

### Redesign Complete
- [x] Global Theme System (`src/theme/`)
- [x] Core Components updated to "Cognitive Sanctuary" specs.
- [x] Onboarding/Login redesign.
- [x] Home (Daily Briefing) hub redesign.
- [x] GSuite Connection and Memory Status redesign.
- [x] Data Browser redesign with tonal tab navigation.

### Roadmap Priorities
1. **Semantic Memory (RAG):** Indexing local and cloud data into a vector store for natural language recall.
2. **Proactive Intelligence:** Implementing Autonomous Agenda Balancing and predictive conflict resolution.
3. **Ghostwriter:** LLM-powered drafting agent for Gmail and Docs.

## Getting Started

1.  **Install dependencies:** `npm install`
2.  **Start Metro:** `npm start`
3.  **Run on iOS/Android:** `npm run ios` or `npm run android`
