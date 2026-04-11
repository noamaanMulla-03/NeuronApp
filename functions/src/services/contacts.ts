import * as admin from 'firebase-admin';
import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from './firestore';

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

interface PersonRelation {
  person?: string;
  type?: string;
}

interface PersonBiography {
  value?: string;
}

interface Person {
  resourceName: string;
  etag: string;
  names?: PersonName[];
  emailAddresses?: PersonEmail[];
  phoneNumbers?: PersonPhone[];
  organizations?: PersonOrganization[];
  photos?: PersonPhoto[];
  relations?: PersonRelation[];
  biographies?: PersonBiography[];
}

interface ConnectionsResponse {
  connections?: Person[];
  nextPageToken?: string;
  nextSyncToken?: string;
  totalPeople?: number;
  totalItems?: number;
}

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos,relations,biographies';

export async function syncContacts(accessToken: string, uid: string): Promise<number> {
  const db = admin.firestore();
  const metaRef = db.doc(`users/${uid}/sync_meta/status`);
  const metaDoc = await metaRef.get();
  const metaData = metaDoc.data();
  const syncToken = metaData?.contacts?.syncToken;

  let totalItemCount = 0;
  let pageToken: string | undefined;
  let newSyncToken: string | undefined;

  do {
    const params: Record<string, string | undefined> = {
      personFields: PERSON_FIELDS,
      pageSize: '1000', // Server can handle larger pages
      pageToken,
    };

    if (syncToken && !pageToken) {
      params.syncToken = syncToken;
      params.requestSyncToken = 'true';
    } else {
      params.requestSyncToken = 'true';
    }

    const url = buildUrl(API, '/v1/people/me/connections', params);

    let response: ConnectionsResponse;
    try {
      response = await googleFetch<ConnectionsResponse>(accessToken, url);
    } catch (error: any) {
      // syncToken expired (410 Gone) — clear it and do a full sync.
      if (error.message?.includes('410') && syncToken) {
        await writeUserDoc(uid, ['sync_meta', 'status'], {
          contacts: { syncToken: null },
        });
        return syncContacts(accessToken, uid);
      }
      throw error;
    }

    if (response.connections && response.connections.length > 0) {
      const writes = response.connections.map(person => {
        const id = person.resourceName.replace(/\//g, '_');
        return {
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
            relationships: (person.relations ?? []).map(r => ({
              person: r.person ?? '',
              type: r.type ?? '',
            })),
            notes: person.biographies?.[0]?.value ?? '',
            photoUrl: person.photos?.[0]?.url ?? null,
            syncedAt: new Date().toISOString(),
          },
        };
      });

      await batchWriteUserDocs(uid, writes);
      totalItemCount += writes.length;
    }

    if (response.nextSyncToken) {
      newSyncToken = response.nextSyncToken;
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  await writeUserDoc(uid, ['sync_meta', 'status'], {
    contacts: {
      lastSync: new Date().toISOString(),
      status: 'done',
      itemCount: totalItemCount,
      syncToken: newSyncToken ?? null,
    },
  });

  return totalItemCount;
}
