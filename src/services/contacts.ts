import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, readUserDoc, writeUserDoc } from '../lib/firestore';

const API = BASE_URLS.people;

interface PersonName {
    displayName?: string;
    givenName?: string;
    familyName?: string;
}

interface PersonEmail {
    value: string;
    type?: string;
}

interface PersonPhone {
    value: string;
    type?: string;
}

interface PersonOrganization {
    name?: string;
    title?: string;
}

interface PersonPhoto {
    url: string;
}

interface Person {
    resourceName: string;
    etag: string;
    names?: PersonName[];
    emailAddresses?: PersonEmail[];
    phoneNumbers?: PersonPhone[];
    organizations?: PersonOrganization[];
    photos?: PersonPhoto[];
}

interface ConnectionsResponse {
    connections?: Person[];
    nextPageToken?: string;
    nextSyncToken?: string;
    totalPeople?: number;
    totalItems?: number;
}

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos';

export async function syncContacts(uid: string): Promise<number> {
    const meta = await readUserDoc(uid, ['sync_meta', 'status']);
    const syncToken = meta?.contacts?.syncToken;

    const allContacts: Person[] = [];
    let pageToken: string | undefined;
    let newSyncToken: string | undefined;

    do {
        const params: Record<string, string | undefined> = {
            personFields: PERSON_FIELDS,
            pageSize: '1000',
            pageToken,
        };

        // Use syncToken for incremental sync if available
        if (syncToken && !pageToken) {
            params.syncToken = syncToken;
            params.requestSyncToken = 'true';
        } else {
            params.requestSyncToken = 'true';
        }

        const url = buildUrl(API, '/v1/people/me/connections', params);

        let response: ConnectionsResponse;
        try {
            response = await googleFetch<ConnectionsResponse>(url);
        } catch (error: any) {
            // syncToken expired (410 Gone) — clear it from Firestore and do a full sync.
            // Without clearing first, the recursive call would read the same stale token
            // and hit 410 again, causing infinite recursion.
            if (error.message?.includes('410') && syncToken) {
                await writeUserDoc(uid, ['sync_meta', 'status'], {
                    contacts: { syncToken: null },
                });
                return syncContacts(uid);
            }
            throw error;
        }

        if (response.connections) {
            allContacts.push(...response.connections);
        }
        if (response.nextSyncToken) {
            newSyncToken = response.nextSyncToken;
        }
        pageToken = response.nextPageToken;
    } while (pageToken);

    if (allContacts.length > 0) {
        const writes = allContacts.map(person => {
            const id = person.resourceName.replace(/\//g, '_');
            return {
                // Flat 2-segment path: users/{uid}/contacts_people/{id} = 4 total (even = valid doc ref)
                path: ['contacts_people', id],
                data: {
                    resourceName: person.resourceName,
                    name: person.names?.[0]?.displayName ?? '',
                    givenName: person.names?.[0]?.givenName ?? '',
                    familyName: person.names?.[0]?.familyName ?? '',
                    emails: (person.emailAddresses ?? []).map(e => ({
                        value: e.value,
                        type: e.type ?? 'other',
                    })),
                    phones: (person.phoneNumbers ?? []).map(p => ({
                        value: p.value,
                        type: p.type ?? 'other',
                    })),
                    organizations: (person.organizations ?? []).map(o => ({
                        name: o.name ?? '',
                        title: o.title ?? '',
                    })),
                    photoUrl: person.photos?.[0]?.url ?? null,
                    syncedAt: new Date().toISOString(),
                },
            };
        });

        await batchWriteUserDocs(uid, writes);
    }

    await writeUserDoc(uid, ['sync_meta', 'status'], {
        contacts: {
            lastSync: new Date().toISOString(),
            status: 'done',
            itemCount: allContacts.length,
            syncToken: newSyncToken ?? null,
        },
    });

    return allContacts.length;
}
