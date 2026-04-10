import { googleFetch, buildUrl, BASE_URLS } from '../lib/google-api';
import { batchWriteUserDocs, writeUserDoc } from '../lib/firestore';
import { getWorkspaceFileIds } from './drive';

/**
 * Extracts plain text content from Google Docs, Sheets, and Slides
 * by calling their respective APIs. Requires Drive sync to have run first
 * so we know which files are Google Workspace documents.
 */

// ── Google Docs ──

interface DocsDocument {
    title: string;
    body: {
        content: DocsStructuralElement[];
    };
}

interface DocsStructuralElement {
    paragraph?: {
        elements: { textRun?: { content: string } }[];
    };
    table?: {
        tableRows: {
            tableCells: {
                content: DocsStructuralElement[];
            }[];
        }[];
    };
}

function extractDocsText(doc: DocsDocument): string {
    const parts: string[] = [];

    function processElements(elements: DocsStructuralElement[]) {
        for (const element of elements) {
            if (element.paragraph?.elements) {
                for (const el of element.paragraph.elements) {
                    if (el.textRun?.content) {
                        parts.push(el.textRun.content);
                    }
                }
            }
            if (element.table?.tableRows) {
                for (const row of element.table.tableRows) {
                    for (const cell of row.tableCells) {
                        processElements(cell.content);
                    }
                }
            }
        }
    }

    processElements(doc.body.content);
    return parts.join('');
}

// ── Google Sheets ──

interface SheetsSpreadsheet {
    properties: { title: string };
    sheets: {
        properties: { title: string; sheetId: number };
        data?: {
            rowData?: {
                values?: {
                    formattedValue?: string;
                }[];
            }[];
        }[];
    }[];
}

function extractSheetsText(spreadsheet: SheetsSpreadsheet): string {
    const parts: string[] = [];

    for (const sheet of spreadsheet.sheets) {
        parts.push(`[Sheet: ${sheet.properties.title}]`);
        if (sheet.data) {
            for (const grid of sheet.data) {
                if (grid.rowData) {
                    for (const row of grid.rowData) {
                        if (row.values) {
                            const cells = row.values
                                .map(v => v.formattedValue ?? '')
                                .join('\t');
                            parts.push(cells);
                        }
                    }
                }
            }
        }
    }

    return parts.join('\n');
}

// ── Google Slides ──

interface SlidesPresentation {
    title: string;
    slides: {
        objectId: string;
        pageElements?: {
            shape?: {
                text?: {
                    textElements?: {
                        textRun?: { content: string };
                    }[];
                };
            };
        }[];
    }[];
}

function extractSlidesText(presentation: SlidesPresentation): string {
    const parts: string[] = [];

    for (let i = 0; i < presentation.slides.length; i++) {
        const slide = presentation.slides[i];
        parts.push(`[Slide ${i + 1}]`);
        if (slide.pageElements) {
            for (const element of slide.pageElements) {
                if (element.shape?.text?.textElements) {
                    for (const te of element.shape.text.textElements) {
                        if (te.textRun?.content) {
                            parts.push(te.textRun.content);
                        }
                    }
                }
            }
        }
    }

    return parts.join('\n');
}

// ── Main sync ──

const MIME_TO_API: Record<string, string> = {
    'application/vnd.google-apps.document': 'docs',
    'application/vnd.google-apps.spreadsheet': 'sheets',
    'application/vnd.google-apps.presentation': 'slides',
};

async function fetchDocContent(
    fileId: string,
    mimeType: string,
): Promise<{ title: string; text: string }> {
    const apiType = MIME_TO_API[mimeType];

    if (apiType === 'docs') {
        const url = buildUrl(BASE_URLS.docs, `/v1/documents/${fileId}`);
        const doc = await googleFetch<DocsDocument>(url);
        return { title: doc.title, text: extractDocsText(doc) };
    }

    if (apiType === 'sheets') {
        const url = buildUrl(BASE_URLS.sheets, `/v4/spreadsheets/${fileId}`, {
            includeGridData: 'true',
        });
        const sheet = await googleFetch<SheetsSpreadsheet>(url);
        return { title: sheet.properties.title, text: extractSheetsText(sheet) };
    }

    if (apiType === 'slides') {
        const url = buildUrl(BASE_URLS.slides, `/v1/presentations/${fileId}`);
        const pres = await googleFetch<SlidesPresentation>(url);
        return { title: pres.title, text: extractSlidesText(pres) };
    }

    throw new Error(`Unsupported mimeType: ${mimeType}`);
}

export async function syncDocs(uid: string): Promise<number> {
    // Get list of Google Workspace files from Drive
    const workspaceFiles = await getWorkspaceFileIds(uid);

    if (workspaceFiles.length === 0) { return 0; }

    // Process in batches of 5 to avoid rate limits
    const BATCH_SIZE = 5;
    const writes: { path: string[]; data: Record<string, any> }[] = [];

    for (let i = 0; i < workspaceFiles.length; i += BATCH_SIZE) {
        const batch = workspaceFiles.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
            batch.map(async file => {
                const content = await fetchDocContent(file.id, file.mimeType);
                // Cap at 900KB
                const cappedText = content.text.length > 900_000
                    ? content.text.slice(0, 900_000)
                    : content.text;

                return {
                    // Flat 2-segment path: users/{uid}/docs_content/{id} = 4 total (even = valid doc ref)
                    path: ['docs_content', file.id] as string[],
                    data: {
                        title: content.title,
                        mimeType: file.mimeType,
                        extractedText: cappedText,
                        textLength: content.text.length,
                        syncedAt: new Date().toISOString(),
                    },
                };
            }),
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                writes.push(result.value);
            }
            // Skip failed docs silently — they may be inaccessible
        }
    }

    if (writes.length > 0) {
        await batchWriteUserDocs(uid, writes);
    }

    await writeUserDoc(uid, ['sync_meta', 'status'], {
        docs: {
            lastSync: new Date().toISOString(),
            status: 'done',
            itemCount: writes.length,
        },
    });

    return writes.length;
}
