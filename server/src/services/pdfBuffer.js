import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
// Adapt the existing download renderers so email and portal PDFs stay identical.
export async function pdfBuffer(render, ...args) {
  const chunks = [];
  const sink = new Writable({write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); }});
  sink.setHeader = () => {};
  const completion = finished(sink);
  try { await render(sink, ...args); await completion; return Buffer.concat(chunks); }
  catch (error) { sink.destroy(); await completion.catch(() => {}); throw error; }
}
