import http from 'node:http';

// A tiny local website for saving tests. Recall only saves http(s) pages, and a
// local server keeps the tests offline and deterministic.

const PAGES: Record<string, { title: string; body: string }> = {
  '/article.html': {
    title: 'Deep work notes',
    body: `
      <h1>Deep work notes</h1>
      <p id="quote">Focus is a skill that improves with deliberate practice.</p>
      <p id="second">A second paragraph,
        spread over two lines.</p>
      <textarea id="draft">Draft text inside a text field</textarea>
      <input id="secret" type="password" value="not-a-real-password">`,
  },
  '/other.html': {
    title: 'Another page',
    body: '<h1>Another page</h1><p id="intro">Nothing to see here.</p>',
  },
};

// A one-page PDF with a title and one line of text, so tests can check how Recall
// behaves in the browser's built-in PDF viewer.
export const PDF_TITLE = 'Recall test PDF';
export const PDF_TEXT = 'Recall PDF test sentence.';

function buildPdf(): Buffer {
  const content = `BT /F1 24 Tf 72 700 Td (${PDF_TEXT}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Title (${PDF_TITLE}) >>`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${String(index + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R /Info 6 0 R >>\n`;
  pdf += `startxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export type TestSite = {
  /** Absolute URL of a page on the site, such as `url('/article.html')`. */
  url: (path: string) => string;
  close: () => Promise<void>;
};

export async function startTestSite(): Promise<TestSite> {
  const pdf = buildPdf();
  const server = http.createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/paper.pdf') {
      response.writeHead(200, { 'content-type': 'application/pdf' });
      response.end(pdf);
      return;
    }
    const page = PAGES[path];
    if (!page) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${page.title}</title></head><body>${page.body}</body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('Test site has no port');
  const origin = `http://127.0.0.1:${String(address.port)}`;
  return {
    url: (path) => `${origin}${path}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
