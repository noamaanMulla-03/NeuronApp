import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, readUserDoc, writeUserDoc } from '../lib/firestore';

const API = BASE_URLS.calendar;

interface CalendarListEntry {
    id: string;
    summary: string;
    primary?: boolean;
    backgroundColor?: string;
    accessRole: string;
}

interface CalendarEvent {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    attendees?: { email: string; displayName?: string; responseStatus?: string }[];
    status: string;
    created: string;
    updated: string;
    recurringEventId?: string;
    organizer?: { email: string; displayName?: string };
}

interface CalendarListResponse {
    items: CalendarListEntry[];
    nextPageToken?: string;
}

interface EventsListResponse {
    items: CalendarEvent[];
    nextPageToken?: string;
    nextSyncToken?: string;
}

export async function syncCalendar(uid: string): Promise<number> {
    const meta = await readUserDoc(uid, ['sync_meta', 'status']);
    const lastSync = meta?.calendar?.lastSync;

    // 1. Fetch calendar list
    const calendarsUrl = buildUrl(API, '/calendar/v3/users/me/calendarList');
    const calendars = await googleFetch<CalendarListResponse>(calendarsUrl);

    if (calendars.items?.length) {
        const calWrites = calendars.items.map(cal => ({
            // Flat 2-segment path: users/{uid}/calendar_calendars/{id} = 4 total (even = valid doc ref)
            path: ['calendar_calendars', cal.id.replace(/[/.]/g, '_')],
            data: {
                summary: cal.summary,
                primary: cal.primary ?? false,
                backgroundColor: cal.backgroundColor ?? null,
                accessRole: cal.accessRole,
                syncedAt: new Date().toISOString(),
            },
        }));
        await batchWriteUserDocs(uid, calWrites);
    }

    // 2. Fetch events from each calendar
    let totalEvents = 0;

    for (const calendar of calendars.items ?? []) {
        const allEvents: CalendarEvent[] = [];
        let pageToken: string | undefined;

        do {
            const params: Record<string, string | undefined> = {
                maxResults: '250',
                singleEvents: 'true',
                orderBy: 'startTime',
                pageToken,
            };

            if (lastSync) {
                params.updatedMin = lastSync;
            } else {
                // On first sync, fetch past 6 months + future events
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                params.timeMin = sixMonthsAgo.toISOString();
            }

            const eventsUrl = buildUrl(
                API,
                `/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
                params,
            );

            const response = await googleFetch<EventsListResponse>(eventsUrl);
            if (response.items) {
                allEvents.push(...response.items);
            }
            pageToken = response.nextPageToken;
        } while (pageToken);

        if (allEvents.length > 0) {
            const writes = allEvents.map(event => ({
                // Flat 2-segment path: users/{uid}/calendar_events/{id} = 4 total (even = valid doc ref)
                path: ['calendar_events', event.id],
                data: {
                    calendarId: calendar.id,
                    summary: event.summary ?? '',
                    description: event.description ?? '',
                    location: event.location ?? '',
                    start: event.start,
                    end: event.end,
                    attendees: event.attendees ?? [],
                    status: event.status,
                    created: event.created,
                    updated: event.updated,
                    organizer: event.organizer ?? null,
                    recurringEventId: event.recurringEventId ?? null,
                    syncedAt: new Date().toISOString(),
                },
            }));
            await batchWriteUserDocs(uid, writes);
            totalEvents += writes.length;
        }
    }

    await writeUserDoc(uid, ['sync_meta', 'status'], {
        calendar: {
            lastSync: new Date().toISOString(),
            status: 'done',
            itemCount: totalEvents,
        },
    });

    return totalEvents;
}
