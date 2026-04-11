import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';

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
import { syncKeep } from './services/keep';
import { syncChat } from './services/chat';

interface SyncRequestData {
  service: string;
  accessToken: string;
}

/**
 * Callable function to sync a specific Google Workspace service.
 */
export const syncService = onCall<SyncRequestData>(async request => {
  logger.info('syncService called', {
    service: request.data?.service,
    hasToken: !!request.data?.accessToken,
    uid: request.auth?.uid,
  });

  // 1. Verify Authentication
  if (!request.auth) {
    logger.error('Unauthorized call to syncService');
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const { service, accessToken } = request.data;
  const uid = request.auth.uid;

  if (!service || !accessToken) {
    logger.error('Invalid arguments', { service, hasToken: !!accessToken });
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
      case 'keep':
        itemCount = await syncKeep(accessToken, uid);
        break;
      case 'chat':
        itemCount = await syncChat(accessToken, uid);
        break;
      default:
        throw new HttpsError('invalid-argument', `Unsupported service: ${service}`);
    }

    logger.info(`Sync complete for ${service}`, { itemCount, uid });
    return { success: true, itemCount };
  } catch (error: any) {
    logger.error(`Sync error for ${service}`, {
      error: error.message,
      stack: error.stack,
      uid,
    });

    if (error.message === 'UNAUTHENTICATED') {
      throw new HttpsError('unauthenticated', 'Google Access Token is expired or invalid.');
    }

    // Re-throw HttpsErrors, otherwise wrap as unknown to expose to client
    // Note: Forced redeploy to ensure new error handling is active.
    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'unknown',
      error.message || 'An unknown error occurred during sync.',
      { stack: error.stack }
    );
  }
});

// AI & Semantic Memory Features
export * from './services/vector-sync';
export * from './services/chat-retrieval';
