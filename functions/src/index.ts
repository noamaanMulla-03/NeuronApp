import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

// Initialize Firebase Admin
admin.initializeApp();

// Set global options for all functions
setGlobalOptions({
  maxInstances: 10,
  timeoutSeconds: 300, // 5 minutes for long syncs
  memory: '512MiB', // Enough memory for processing batches
});

import { syncGmail } from './services/gmail';
import { syncDrive } from './services/drive';
import { syncDocs } from './services/docs';
import { syncCalendar } from './services/calendar';
import { syncContacts } from './services/contacts';
import { syncTasks } from './services/tasks';

interface SyncRequestData {
  service: string;
  accessToken: string;
}

/**
 * Callable function to sync a specific Google Workspace service.
 */
export const syncService = onCall<SyncRequestData>(async request => {
  // 1. Verify Authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const { service, accessToken } = request.data;
  const uid = request.auth.uid;

  if (!service || !accessToken) {
    throw new HttpsError('invalid-argument', 'The function must be called with "service" and "accessToken".');
  }

  try {
    let itemCount = 0;

    switch (service) {
      case 'gmail':
        itemCount = await syncGmail(accessToken, uid);
        break;
      case 'drive':
        itemCount = await syncDrive(accessToken, uid);
        break;
      case 'docs':
        itemCount = await syncDocs(accessToken, uid);
        break;
      case 'calendar':
        itemCount = await syncCalendar(accessToken, uid);
        break;
      case 'contacts':
        itemCount = await syncContacts(accessToken, uid);
        break;
      case 'tasks':
        itemCount = await syncTasks(accessToken, uid);
        break;
      // Add other services as they are ported
      default:
        throw new HttpsError('invalid-argument', `Unsupported service: ${service}`);
    }

    return { success: true, itemCount };
  } catch (error: any) {
    console.error(`Sync error for ${service}:`, error);

    if (error.message === 'UNAUTHENTICATED') {
      throw new HttpsError('unauthenticated', 'Google Access Token is expired or invalid.');
    }

    throw new HttpsError('internal', error.message || 'An unknown error occurred during sync.');
  }
});
