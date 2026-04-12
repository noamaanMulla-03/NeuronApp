import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { z } from 'zod';
import { ai } from '../lib/genkit';
import { vertexAI } from '@genkit-ai/vertexai';

// ---------------------------------------------------------------------------
// Output schema — Zod enforces structure on the Gemini response so callers get
// a predictable, typed object rather than free-form text.
// ---------------------------------------------------------------------------
const BriefingSchema = z.object({
    greeting: z.string(),                  // Single warm sentence for the day
    summary: z.string(),                   // 2-3 paragraph narrative of priorities
    eventHighlights: z.array(z.string()),  // Up to 3 key calendar bullets
    priorityTasks: z.array(z.string()),    // Up to 3 most urgent tasks
    importantEmails: z.array(z.string()),  // Up to 3 emails needing attention
});

type BriefingOutput = z.infer<typeof BriefingSchema>;

// ---------------------------------------------------------------------------
// Context aggregation caps — keeps each LLM call bounded and cost-predictable
// ---------------------------------------------------------------------------
const MAX_EVENTS = 10;
const MAX_TASKS = 5;
const MAX_EMAILS = 5;

// How far back to look for "important" emails (24 hours in milliseconds)
const TWENTY_FOUR_HOURS_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Types describing the data we aggregate per user before calling the LLM
// ---------------------------------------------------------------------------
interface EventContext {
    summary: string;
    start: string;
    end: string;
    attendeeCount: number;
    hasVideoLink: boolean;
}

interface TaskContext {
    title: string;
    due: string | null;
    notes: string;
}

interface EmailContext {
    subject: string;
    from: string;
    snippet: string;
}

interface AggregatedContext {
    events: EventContext[];
    tasks: TaskContext[];
    emails: EmailContext[];
}

// ---------------------------------------------------------------------------
// Date helpers — timezone-aware using Intl (no external deps)
// ---------------------------------------------------------------------------

/**
 * Returns today's YYYY-MM-DD string in a given IANA timezone (e.g. 'America/New_York').
 * sv-SE locale produces ISO-style date strings natively, so no parsing is needed.
 */
function localDateStr(tz: string): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date());
}

/**
 * Returns whether a timed calendar event (stored as a timezone-aware ISO string
 * like '2026-04-12T09:00:00-05:00') falls on 'today' in the given IANA timezone.
 * Constructing a Date object from the ISO string correctly shifts to UTC,
 * so the Intl.DateTimeFormat can then re-localise to the user's timezone.
 */
function isEventToday(isoDateTime: string, todayStr: string, tz: string): boolean {
    const eventDate = new Date(isoDateTime);
    // Guard against unparseable values stored in Firestore
    if (isNaN(eventDate.getTime())) return false;
    return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(eventDate) === todayStr;
}

/** Returns the current hour (0-23) in the given IANA timezone */
function localHour(tz: string): number {
    return parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()),
        10,
    );
}

/** Formats a start–end ISO datetime pair as a readable local time range */
function localTimeRange(startIso: string, endIso: string, tz: string): string {
    // All-day events use date-only strings (YYYY-MM-DD) — no time to format
    if (!startIso.includes('T')) return 'All day';
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
    const s = new Date(startIso);
    const e = new Date(endIso);
    if (isNaN(s.getTime())) return startIso;
    if (isNaN(e.getTime())) return fmt.format(s);
    return `${fmt.format(s)} – ${fmt.format(e)}`;
}

// ---------------------------------------------------------------------------
// Data aggregation — reads all three collections in parallel then filters
// in JS. Avoids needing composite Firestore indexes beyond the auto-created
// single-field ones that already exist for each collection.
// ---------------------------------------------------------------------------

/**
 * Reads today's events, pending tasks, and recent important emails for a user
 * from their synced Firestore collections. No Google API calls required.
 *
 * Timezone and today's date string are resolved by the caller (the scheduled
 * function), which reads them first to decide whether to skip the user.
 */
async function aggregateBriefingData(uid: string, tz: string, todayStr: string): Promise<AggregatedContext> {
    const db = admin.firestore();
    const base = db.collection('users').doc(uid);

    // Read all three data collections in parallel — timezone is already resolved
    const [allEvents, pendingTasks, importantEmails] = await Promise.all([
        // All synced calendar events — filtered in JS (nested `start` map fields
        // cannot be range-queried without a composite index)
        base.collection('calendar_events').get(),

        // Single-field equality on `status` uses the auto-created Firestore index
        base.collection('tasks_items').where('status', '==', 'needsAction').get(),

        // Single-field equality on `isImportant`; time-window applied in JS
        base.collection('gmail_messages').where('isImportant', '==', true).limit(200).get(),
    ]);

    // ---- Calendar events: keep only those whose local start date == today ----
    const events: EventContext[] = allEvents.docs
        .filter(d => {
            const s = d.data().start;
            if (!s) return false;
            if (s.dateTime) {
                // Timed event: parse the ISO string (preserves timezone offset) then
                // re-localise to the user's timezone for the date comparison
                return isEventToday(s.dateTime, todayStr, tz);
            }
            // All-day event: `start.date` is already 'YYYY-MM-DD' — compare directly
            return s.date === todayStr;
        })
        .slice(0, MAX_EVENTS)
        .map(d => {
            const data = d.data();
            return {
                summary: data.summary ?? 'Untitled event',
                start: data.start?.dateTime ?? data.start?.date ?? '',
                end: data.end?.dateTime ?? data.end?.date ?? '',
                attendeeCount: (data.attendees ?? []).length,
                hasVideoLink: !!data.hangoutLink,
            };
        });

    // ---- Tasks: overdue or due today, in the user's local timezone ----
    // The Tasks API stores `due` as 'YYYY-MM-DDT00:00:00.000Z' (midnight UTC).
    // We extract just the date portion and compare against the user's local today.
    const tasks: TaskContext[] = pendingTasks.docs
        .filter(d => {
            const due = d.data().due as string | undefined;
            if (!due) return true; // Undated tasks are always surfaced
            // Parse the midnight-UTC timestamp and localise to the user's timezone
            const dueDate = new Date(due);
            if (isNaN(dueDate.getTime())) return false;
            const dueDateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(dueDate);
            return dueDateStr <= todayStr; // Include overdue (earlier) and due today
        })
        .slice(0, MAX_TASKS)
        .map(d => ({
            title: d.data().title ?? '',
            due: d.data().due ?? null,
            notes: d.data().notes ?? '',
        }));

    // ---- Emails: important AND received in the last 24 hours (epoch-based) ----
    // internalDate is a Unix-milliseconds string — timezone-independent
    const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;

    const emails: EmailContext[] = importantEmails.docs
        .filter(d => parseInt(d.data().internalDate ?? '0', 10) >= cutoff)
        .slice(0, MAX_EMAILS)
        .map(d => ({
            subject: d.data().subject ?? '(no subject)',
            from: d.data().from ?? '',
            snippet: d.data().snippet ?? '',
        }));

    return { events, tasks, emails };
}

// ---------------------------------------------------------------------------
// LLM synthesis — builds a compact prompt from the aggregated context and
// calls Gemini for a structured JSON response validated against BriefingSchema
// ---------------------------------------------------------------------------

/**
 * Calls gemini-2.5-flash (consistent with chat-retrieval.ts) with the user's
 * aggregated context and returns a validated BriefingOutput object.
 */
async function synthesiseBrief(
    context: AggregatedContext,
    dateStr: string,
    tz: string,
): Promise<BriefingOutput> {
    // Serialise context into human-readable blocks; format times in the user's
    // local timezone so the model outputs user-friendly time references
    const eventsBlock = context.events.length
        ? context.events.map((e, i) =>
            `${i + 1}. ${e.summary} | ${localTimeRange(e.start, e.end, tz)}` +
            (e.attendeeCount > 1 ? ` | ${e.attendeeCount} attendees` : '') +
            (e.hasVideoLink ? ' | has video link' : ''),
        ).join('\n')
        : 'None.';

    const tasksBlock = context.tasks.length
        ? context.tasks.map((t, i) =>
            `${i + 1}. ${t.title}` +
            (t.due ? ` (due ${t.due.slice(0, 10)})` : ' (no due date)') +
            (t.notes ? ` — ${t.notes.slice(0, 120)}` : ''),
        ).join('\n')
        : 'None.';

    const emailsBlock = context.emails.length
        ? context.emails.map((e, i) =>
            `${i + 1}. "${e.subject}" from ${e.from} — ${e.snippet.slice(0, 150)}`,
        ).join('\n')
        : 'None.';

    const response = await ai.generate({
        model: vertexAI.model('gemini-2.5-flash'),
        prompt:
            `You are Neuron, a proactive AI assistant writing a concise morning brief for ${dateStr} (timezone: ${tz}).\n` +
            `All times shown are already in the user's local timezone (${tz}). Reference them as-is.\n\n` +
            `TODAY'S CALENDAR EVENTS:\n${eventsBlock}\n\n` +
            `PENDING TASKS (overdue or due today):\n${tasksBlock}\n\n` +
            `IMPORTANT EMAILS (last 24 hours):\n${emailsBlock}\n\n` +
            `Produce a morning briefing:\n` +
            `- greeting: a warm, one-line personal greeting that references the date\n` +
            `- summary: 2-3 sentences synthesising the day's priorities; flag any conflicts or tensions\n` +
            `- eventHighlights: up to 3 strings — the most important calendar items (omit trivial ones)\n` +
            `- priorityTasks: up to 3 strings — the most urgent actionable tasks\n` +
            `- importantEmails: up to 3 strings — emails that need attention today\n` +
            `Be concise, actionable, and non-redundant. Omit empty arrays entirely.`,
        output: { schema: BriefingSchema },
    });

    // response.output is validated against BriefingSchema by Genkit — safe cast
    return response.output as BriefingOutput;
}

// ---------------------------------------------------------------------------
// Scheduled Cloud Function — fan-out entry point
// ---------------------------------------------------------------------------

/**
 * Runs every hour. For each user, reads their stored IANA timezone, checks if
 * their local time is >= 07:00, and (if no brief exists for today) aggregates
 * context and calls Gemini to synthesise a brief. Writes the result to
 * users/{uid}/daily_briefings/{YYYY-MM-DD}.
 *
 * Per-user failures are caught and logged without aborting the full run.
 */
export const generateDailyBriefings = onSchedule(
    {
        // Run every hour so users in any timezone receive their brief close to
        // 07:00 local time. The morning-hour gate + idempotency guard together
        // ensure each user receives exactly one brief per day, after 7 AM local.
        schedule: '0 * * * *',
        timeZone: 'UTC',
        timeoutSeconds: 300,
        memory: '512MiB',
    },
    async () => {
        const db = admin.firestore();

        // Fetch all top-level user document references (doesn't load document data)
        const userRefs = await db.collection('users').listDocuments();

        logger.info(`generateDailyBriefings: run started`, { users: userRefs.length });

        let processed = 0;
        let skipped = 0;
        let failed = 0;

        for (const userRef of userRefs) {
            const uid = userRef.id;

            try {
                // Read timezone first — needed for the morning-hour gate before
                // committing to the full data aggregation read
                const tzSnap = await db.doc(`users/${uid}/settings/timezone`).get();
                const tz = (tzSnap.data()?.tz as string) || 'UTC';

                // Morning-hour gate — only generate briefs after 7 AM in the
                // user's local timezone so the brief reflects fresh morning data
                if (localHour(tz) < 7) {
                    skipped++;
                    continue;
                }

                const dateStr = localDateStr(tz);
                const briefRef = db.doc(`users/${uid}/daily_briefings/${dateStr}`);

                // --- Idempotency guard: skip if today's brief already exists ---
                const existing = await briefRef.get();
                if (existing.exists) {
                    skipped++;
                    continue;
                }

                const context = await aggregateBriefingData(uid, tz, dateStr);

                const hasData = context.events.length > 0 ||
                    context.tasks.length > 0 ||
                    context.emails.length > 0;

                if (!hasData) {
                    // No synced data for this user — write a minimal doc so future calls
                    // still pass the idempotency check and the app can show an empty state
                    await briefRef.set({
                        date: dateStr,
                        greeting: `Good morning — ${dateStr}. Your workspace is clear today.`,
                        summary: 'No events, tasks, or important emails found. Sync your Google Workspace to get personalised briefings.',
                        eventHighlights: [],
                        priorityTasks: [],
                        importantEmails: [],
                        generatedAt: new Date().toISOString(),
                        contextStats: { events: 0, tasks: 0, emails: 0 },
                    });
                    processed++;
                    continue;
                }

                // --- Call Gemini for the full synthesised brief ---
                const brief = await synthesiseBrief(context, dateStr, tz);

                await briefRef.set({
                    date: dateStr,
                    ...brief,
                    generatedAt: new Date().toISOString(),
                    contextStats: {
                        events: context.events.length,
                        tasks: context.tasks.length,
                        emails: context.emails.length,
                    },
                });

                processed++;
                logger.info(`generateDailyBriefings: brief written for ${uid}`, {
                    events: context.events.length,
                    tasks: context.tasks.length,
                    emails: context.emails.length,
                });
            } catch (err: any) {
                // Per-user errors must not abort the entire fan-out
                failed++;
                logger.error(`generateDailyBriefings: failed for user ${uid}`, {
                    error: err.message,
                    stack: err.stack,
                });
            }
        }

        logger.info(`generateDailyBriefings: run complete`, {
            total: userRefs.length,
            processed,
            skipped,
            failed,
        });
    },
);
