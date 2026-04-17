import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { z } from 'genkit';
import { ai } from '../lib/genkit';
import { vertexAI } from '@genkit-ai/vertexai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarEvent {
    id: string;
    summary: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    attendees?: any[];
    organizer?: { email: string; displayName?: string };
    hangoutLink?: string;
    recurringEventId?: string;
}

// ---------------------------------------------------------------------------
// Overlap Detection — pure interval comparison on timed events
// ---------------------------------------------------------------------------

function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
    const aStart = new Date(a.start.dateTime!).getTime();
    const aEnd = new Date(a.end.dateTime!).getTime();
    const bStart = new Date(b.start.dateTime!).getTime();
    const bEnd = new Date(b.end.dateTime!).getTime();
    return aStart < bEnd && bStart < aEnd;
}

// ---------------------------------------------------------------------------
// LLM Priority Classification — determines which event takes precedence
// ---------------------------------------------------------------------------

async function classifyConflict(
    eventA: CalendarEvent,
    eventB: CalendarEvent,
): Promise<{ highPriorityId: string; reason: string; suggestedAction: string } | null> {
    // Format event details for LLM context
    const formatEvent = (e: CalendarEvent, label: string) => {
        const attendees = (e.attendees ?? []).length;
        const time = e.start.dateTime
            ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : 'unknown';
        return `${label}: "${e.summary || 'Untitled'}" at ${time}` +
            (attendees > 0 ? `, ${attendees} attendees` : '') +
            (e.hangoutLink ? ', video call' : '') +
            (e.recurringEventId ? ', recurring' : ', one-time') +
            (e.organizer?.displayName ? `, organized by ${e.organizer.displayName}` : '');
    };

    try {
        const response = await ai.generate({
            model: vertexAI.model('gemini-2.5-flash'),
            config: { temperature: 0 },
            prompt:
                'Two calendar events overlap. Determine which is higher priority.\n' +
                'Rules: external meetings > internal, more attendees > fewer, ' +
                'one-time > recurring, video calls indicate importance.\n\n' +
                formatEvent(eventA, 'Event A') + '\n' +
                formatEvent(eventB, 'Event B') + '\n\n' +
                'Return JSON with highPriority ("A" or "B"), reason (1 sentence), ' +
                'and suggestedAction (actionable suggestion for rescheduling the lower priority one).',
            output: {
                schema: z.object({
                    highPriority: z.enum(['A', 'B']),
                    reason: z.string(),
                    suggestedAction: z.string(),
                }),
            },
        });

        const result = response.output;
        if (!result) return null;

        return {
            highPriorityId: result.highPriority === 'A' ? eventA.id : eventB.id,
            reason: result.reason,
            suggestedAction: result.suggestedAction,
        };
    } catch (err: any) {
        logger.warn('Conflict classification failed', { error: err.message });
        return null;
    }
}

// ---------------------------------------------------------------------------
// Conflict Detection — reads synced calendar events from Firestore,
// finds overlapping timed events in the next 3 days, classifies priority,
// and stores conflict resolutions for user review.
// Called by auto-sync after each calendar sync.
// ---------------------------------------------------------------------------

export async function detectAndStoreConflicts(uid: string): Promise<number> {
    const db = admin.firestore();

    // 3-day lookahead window
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);
    const endStr = windowEnd.toISOString().slice(0, 10);

    // Read all calendar events — filter in JS (no composite index needed)
    const snap = await db.collection(`users/${uid}/calendar_events`).get();

    // Keep only timed events within the 3-day window, sorted by start time
    const timedEvents: CalendarEvent[] = snap.docs
        .map(d => ({ ...(d.data() as CalendarEvent), id: d.id }))
        .filter(e => {
            if (!e.start?.dateTime) return false; // Skip all-day events
            const dateStr = e.start.dateTime.slice(0, 10);
            return dateStr >= todayStr && dateStr <= endStr;
        })
        .sort((a, b) =>
            new Date(a.start.dateTime!).getTime() - new Date(b.start.dateTime!).getTime()
        );

    // Find overlapping pairs using sweep-line approach
    const conflicts: [CalendarEvent, CalendarEvent][] = [];
    for (let i = 0; i < timedEvents.length; i++) {
        for (let j = i + 1; j < timedEvents.length; j++) {
            // Early exit: if j starts after i ends, no more overlaps for i
            if (new Date(timedEvents[j].start.dateTime!).getTime() >=
                new Date(timedEvents[i].end.dateTime!).getTime()) break;

            if (eventsOverlap(timedEvents[i], timedEvents[j])) {
                conflicts.push([timedEvents[i], timedEvents[j]]);
            }
        }
    }

    if (conflicts.length === 0) return 0;

    // De-duplicate against existing pending conflicts
    const existingSnap = await db.collection(`users/${uid}/conflict_resolutions`)
        .where('status', '==', 'pending')
        .get();
    const existingPairs = new Set(
        existingSnap.docs.map(d => {
            const data = d.data();
            return `${data.highPriorityEvent.id}|${data.lowPriorityEvent.id}`;
        })
    );

    let stored = 0;
    for (const [eventA, eventB] of conflicts) {
        // Skip pairs that already have a pending resolution (either direction)
        const key1 = `${eventA.id}|${eventB.id}`;
        const key2 = `${eventB.id}|${eventA.id}`;
        if (existingPairs.has(key1) || existingPairs.has(key2)) continue;

        // LLM classifies which event takes priority
        const classification = await classifyConflict(eventA, eventB);
        if (!classification) continue;

        const [high, low] = classification.highPriorityId === eventA.id
            ? [eventA, eventB]
            : [eventB, eventA];

        // Persist the conflict resolution for frontend display
        await db.collection(`users/${uid}/conflict_resolutions`).add({
            highPriorityEvent: {
                id: high.id,
                summary: high.summary || 'Untitled',
                start: high.start.dateTime!,
                end: high.end.dateTime!,
            },
            lowPriorityEvent: {
                id: low.id,
                summary: low.summary || 'Untitled',
                start: low.start.dateTime!,
                end: low.end.dateTime!,
            },
            reason: classification.reason,
            suggestedAction: classification.suggestedAction,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        existingPairs.add(key1); // Prevent within-batch duplicates
        stored++;
    }

    if (stored > 0) logger.info('Conflicts detected', { uid, count: stored });
    return stored;
}

// ---------------------------------------------------------------------------
// Cloud Function: resolveConflict — user acknowledges or dismisses a conflict
// ---------------------------------------------------------------------------

export const resolveConflict = onCall<{ conflictId: string; action: 'acknowledged' | 'dismissed' }>(
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

        const { conflictId, action } = request.data;
        if (!conflictId || !action) {
            throw new HttpsError('invalid-argument', 'conflictId and action required.');
        }
        if (action !== 'acknowledged' && action !== 'dismissed') {
            throw new HttpsError('invalid-argument', 'Action must be "acknowledged" or "dismissed".');
        }

        const uid = request.auth.uid;
        const db = admin.firestore();
        const ref = db.doc(`users/${uid}/conflict_resolutions/${conflictId}`);

        const doc = await ref.get();
        if (!doc.exists) throw new HttpsError('not-found', 'Conflict not found.');

        await ref.update({
            status: action,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        logger.info('Conflict resolved', { uid, conflictId, action });
        return { success: true };
    },
);
