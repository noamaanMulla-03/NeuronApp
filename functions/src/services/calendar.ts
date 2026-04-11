import * as admin from 'firebase-admin';
import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from './firestore';

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

export async function syncCalendar(accessToken: string, uid: string): Promise<number> {
  const db = admin.firestore();
  const metaRef = db.doc(`users/${uid}/sync_meta/status`);
  const metaDoc = await metaRef.get();
  const metaData = metaDoc.data();
  const lastSync = metaData?.calendar?.lastSync;

  const calendarsUrl = buildUrl(API, '/calendar/v3/users/me/calendarList');
  const calendars = await googleFetch<CalendarListResponse>(accessToken, calendarsUrl);

  if (calendars.items?.length) {
    const calWrites = calendars.items.map(cal => ({
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

  let totalEvents = 0;
  for (const calendar of calendars.items ?? []) {
    let pageToken: string | undefined;

    do {
      const params: Record<string, string | undefined> = {
        maxResults: '250',
        singleEvents: 'true',
        orderBy: 'startTime',
        pageToken,
        fields: 'nextPageToken,items(id,summary,description,location,start,end,' +
                'attendees,status,created,updated,organizer,recurringEventId)',
      };
      if (lastSync) {
        params.updatedMin = lastSync;
      } else {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        params.timeMin = sixMonthsAgo.toISOString();
      }

      const eventsUrl = buildUrl(
        API,
        `/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
        params,
      );

      const response = await googleFetch<EventsListResponse>(accessToken, eventsUrl);
      if (response.items && response.items.length > 0) {
        const writes = response.items.map(event => ({
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
      pageToken = response.nextPageToken;
    } while (pageToken);
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
