import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addClock, categoryColor, formatMinutes, lines, slugify } from '../constants';
import { DiagramSVG } from '../diagram/DiagramSVG';
import { viewBox } from '../diagram/geometry';
import type { Diagram, Drill, Session } from '../types';

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15; // margin
const CW = PAGE_W - M * 2; // content width
const BRAND = '#1f5f2b';
const INK = '#1d2329';
const MUTED = '#66717d';

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** jsPDF's built-in fonts only cover WinAnsi; map common Unicode punctuation down. */
function clean(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[→]/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

class Writer {
  y = M;
  constructor(public doc: jsPDF) {}

  ensure(h: number) {
    if (this.y + h > PAGE_H - M - 8) {
      this.doc.addPage();
      this.y = M;
    }
  }

  font(size: number, style: 'normal' | 'bold' = 'normal', color = INK) {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...hex(color));
  }

  heading(text: string, x = M, width = CW) {
    this.ensure(14);
    this.y += 3;
    this.font(11, 'bold', BRAND);
    this.doc.text(clean(text).toUpperCase(), x, this.y + 4);
    this.doc.setDrawColor(...hex('#cfd8d2'));
    this.doc.setLineWidth(0.3);
    this.doc.line(x, this.y + 6, x + width, this.y + 6);
    this.y += 10;
  }

  paragraph(text: string) {
    this.font(10);
    for (const para of clean(text).split(/\n\s*\n/)) {
      const wrapped: string[] = this.doc.splitTextToSize(para.trim(), CW);
      for (const l of wrapped) {
        this.ensure(5);
        this.doc.text(l, M, this.y + 3.5);
        this.y += 4.8;
      }
      this.y += 1.5;
    }
  }

  bullets(items: string[], numbered = false, x = M, width = CW) {
    this.font(10);
    items.forEach((item, i) => {
      const wrapped: string[] = this.doc.splitTextToSize(clean(item), width - 7);
      this.ensure(wrapped.length * 4.8);
      if (numbered) {
        this.font(10, 'bold', BRAND);
        this.doc.text(`${i + 1}.`, x + 1, this.y + 3.5);
        this.font(10);
      } else {
        this.doc.setFillColor(...hex(BRAND));
        this.doc.circle(x + 2, this.y + 2.3, 0.8, 'F');
      }
      wrapped.forEach((l, j) => this.doc.text(l, x + 7, this.y + 3.5 + j * 4.8));
      this.y += wrapped.length * 4.8 + 1.2;
    });
    this.y += 1;
  }

  paragraphHeight(text: string) {
    this.font(10);
    return clean(text)
      .split(/\n\s*\n/)
      .reduce((h, para) => h + this.doc.splitTextToSize(para.trim(), CW).length * 4.8 + 1.5, 0);
  }

  bulletColumnsHeight(sections: { items: string[] }[]) {
    if (!sections.length) return 0;
    const colW = (CW - 8) / sections.length;
    return Math.max(...sections.map((s) => this.bulletsHeight(s.items, colW) + 13));
  }

  private bulletsHeight(items: string[], width: number) {
    this.font(10);
    return items.reduce((h, item) => h + this.doc.splitTextToSize(clean(item), width - 7).length * 4.8 + 1.2, 1);
  }

  /** Bullet sections side by side; falls back to stacking if they can't fit on one page. */
  bulletColumns(sections: { title: string; items: string[]; numbered?: boolean }[]) {
    const gap = 8;
    const colW = (CW - gap) / sections.length;
    const h = Math.max(...sections.map((s) => this.bulletsHeight(s.items, colW) + 13));
    if (sections.length < 2 || h > PAGE_H - M * 2 - 12) {
      for (const s of sections) {
        this.heading(s.title);
        this.bullets(s.items, s.numbered);
      }
      return;
    }
    this.ensure(h);
    const y0 = this.y;
    sections.forEach((s, i) => {
      const x = M + i * (colW + gap);
      this.y = y0;
      this.heading(s.title, x, colW);
      this.bullets(s.items, s.numbered, x, colW);
    });
    this.y = y0 + h;
  }
}

async function drawDiagram(doc: jsPDF, d: Diagram, x: number, y: number, w: number, h: number) {
  const vb = viewBox(d.pitch);
  const markup = renderToStaticMarkup(
    createElement(DiagramSVG, { diagram: d, width: vb.w * 10, height: vb.h * 10 }),
  );
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;';
  host.innerHTML = markup;
  document.body.appendChild(host);
  try {
    await doc.svg(host.firstElementChild as SVGSVGElement, { x, y, width: w, height: h });
  } finally {
    host.remove();
  }
  doc.setDrawColor(...hex('#c9d1cb'));
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
}

/** Lays diagrams out one per row (wide pitches) or two per row (tall/small ones). */
async function drawDiagrams(w: Writer, diagrams: Diagram[], MAX_H = 100) {
  const doc = w.doc;
  const items = diagrams.map((d) => {
    const vb = viewBox(d.pitch);
    return { d, aspect: vb.w / vb.h };
  });
  const twoUp = items.length > 1;
  let i = 0;
  while (i < items.length) {
    const row = twoUp ? items.slice(i, i + 2) : [items[i]];
    const gap = 6;
    const colW = row.length === 2 ? (CW - gap) / 2 : CW;
    const sizes = row.map(({ aspect }) => {
      let width = colW;
      let height = width / aspect;
      if (height > MAX_H) {
        height = MAX_H;
        width = height * aspect;
      }
      return { width, height };
    });
    const rowH = Math.max(...sizes.map((s) => s.height));
    const hasCaption = row.some((r) => r.d.caption) || items.length > 1;
    w.ensure(rowH + (hasCaption ? 8 : 2));
    for (let k = 0; k < row.length; k++) {
      const { width, height } = sizes[k];
      const cellX = M + k * (colW + gap);
      const x = cellX + (colW - width) / 2;
      await drawDiagram(doc, row[k].d, x, w.y, width, height);
      if (hasCaption) {
        const label = items.length > 1 ? `${i + k + 1}. ${row[k].d.caption || ''}` : row[k].d.caption;
        w.font(9, 'bold', MUTED);
        doc.text(clean(label), cellX + colW / 2, w.y + rowH + 5, { align: 'center' });
      }
    }
    w.y += rowH + (hasCaption ? 9 : 4);
    i += row.length;
  }
}

function drawDrillHeader(w: Writer, drill: Drill, banner?: string) {
  const doc = w.doc;
  const cat = categoryColor(drill.category);
  doc.setFillColor(...hex(BRAND));
  doc.rect(0, 0, PAGE_W, banner ? 30 : 26, 'F');
  let y = 10;
  if (banner) {
    w.font(8.5, 'bold', '#bfe3c6');
    doc.text(clean(banner).toUpperCase(), M, y);
    y += 6;
  }
  w.font(17, 'bold', '#ffffff');
  const title: string[] = doc.splitTextToSize(clean(drill.title || 'Untitled drill'), CW - 45);
  doc.text(title[0], M, y + 4);

  // Category tag, right aligned.
  w.font(8.5, 'bold', '#ffffff');
  const tag = clean(drill.category).toUpperCase();
  const tw = doc.getTextWidth(tag) + 6;
  doc.setFillColor(...hex(cat));
  doc.roundedRect(PAGE_W - M - tw, y - 1.5, tw, 7, 1.5, 1.5, 'F');
  doc.text(tag, PAGE_W - M - tw / 2, y + 3.4, { align: 'center' });

  w.y = (banner ? 30 : 26) + 6;
  const meta = [
    ['Duration', drill.duration ? `${drill.duration} min` : ''],
    ['Players', drill.players],
    ['Area', drill.area],
    ['Age group', drill.ageGroup],
  ].filter(([, v]) => v);
  if (meta.length) {
    const colW = CW / meta.length;
    meta.forEach(([k, v], i) => {
      const x = M + i * colW;
      w.font(7.5, 'bold', MUTED);
      doc.text(k.toUpperCase(), x, w.y + 3);
      w.font(10.5, 'bold', INK);
      doc.text(clean(v), x, w.y + 8.5, { maxWidth: colW - 3 });
    });
    w.y += 14;
  }
  if (drill.tags.length) {
    w.font(8.5, 'normal', MUTED);
    doc.text(clean(drill.tags.map((t) => `#${t}`).join('  ')), M, w.y);
    w.y += 5;
  }
}

async function drawDrill(w: Writer, drill: Drill, opts: { banner?: string; notes?: string } = {}) {
  drawDrillHeader(w, drill, opts.banner);
  if (opts.notes?.trim()) {
    // Session-specific note as a callout, above the drill's own content.
    const doc = w.doc;
    w.font(9.5);
    const wrapped: string[] = doc.splitTextToSize(clean(opts.notes.trim()), CW - 10);
    const h = wrapped.length * 4.6 + 7;
    doc.setFillColor(...hex('#eef6ef'));
    doc.roundedRect(M, w.y, CW, h, 1.5, 1.5, 'F');
    doc.setFillColor(...hex(BRAND));
    doc.rect(M, w.y, 1.2, h, 'F');
    w.font(7.5, 'bold', BRAND);
    doc.text('SESSION NOTE', M + 5, w.y + 4.5);
    w.font(9.5);
    doc.text(wrapped, M + 5, w.y + 9);
    w.y += h + 3;
  }
  if (drill.objective.trim()) {
    w.heading('Objective');
    w.paragraph(drill.objective);
  }
  const lists = [
    { title: 'Coaching points', items: lines(drill.coachingPoints) },
    { title: 'Progressions', items: lines(drill.progressions), numbered: true },
  ].filter((s) => s.items.length);
  if (drill.diagrams.length) {
    w.y += 2;
    // Shrink diagrams (within limits) so the whole drill fits on one page when it can.
    const textBelow =
      (drill.setup.trim() ? w.paragraphHeight(drill.setup) + 13 : 0) +
      (drill.instructions.trim() ? w.paragraphHeight(drill.instructions) + 13 : 0) +
      w.bulletColumnsHeight(lists);
    const rows = drill.diagrams.length > 1 ? Math.ceil(drill.diagrams.length / 2) : 1;
    // 8 mm of slack absorbs small differences between the estimate and real text wrapping.
    const free = PAGE_H - M - 8 - w.y - textBelow - rows * 9 - 8;
    await drawDiagrams(w, drill.diagrams, Math.min(100, Math.max(60, free / rows)));
  }
  if (drill.setup.trim()) {
    w.heading('Organisation');
    w.paragraph(drill.setup);
  }
  if (drill.instructions.trim()) {
    w.heading('How it works');
    w.paragraph(drill.instructions);
  }
  if (lists.length) w.bulletColumns(lists);
}

function addFooters(doc: jsPDF, label: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...hex(MUTED));
    doc.text(clean(label), M, PAGE_H - 8);
    doc.text(`${i} / ${n}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
  }
}

function newDoc() {
  return new jsPDF({ unit: 'mm', format: 'a4', compress: true });
}

/** Exports one or more drills, each starting on a new page. */
export async function exportDrillsPdf(drills: Drill[], filename?: string) {
  const doc = await buildDrillsPdf(drills);
  doc.save(filename ?? (drills.length === 1 ? `${slugify(drills[0].title)}.pdf` : 'drills.pdf'));
}

export async function buildDrillsPdf(drills: Drill[]) {
  const doc = newDoc();
  const w = new Writer(doc);
  for (let i = 0; i < drills.length; i++) {
    if (i) {
      doc.addPage();
      w.y = M;
    }
    await drawDrill(w, drills[i]);
  }
  addFooters(doc, drills.length === 1 ? drills[0].title || 'Drill' : `${drills.length} drills`);
  return doc;
}

export async function exportSessionPdf(session: Session, drillsById: Map<string, Drill>) {
  const doc = await buildSessionPdf(session, drillsById);
  doc.save(`${slugify(session.title || 'session')}${session.date ? `-${session.date}` : ''}.pdf`);
}

export async function buildSessionPdf(session: Session, drillsById: Map<string, Drill>) {
  const doc = newDoc();
  const w = new Writer(doc);
  const total = session.items.reduce((t, it) => t + (it.duration || 0), 0);

  // Cover / overview page.
  doc.setFillColor(...hex(BRAND));
  doc.rect(0, 0, PAGE_W, 34, 'F');
  w.font(9, 'bold', '#bfe3c6');
  doc.text('SESSION PLAN', M, 11);
  w.font(19, 'bold', '#ffffff');
  doc.text(clean(session.title || 'Untitled session'), M, 21, { maxWidth: CW });
  w.font(10, 'normal', '#e4f2e7');
  const when = [formatDate(session.date), session.startTime && `${session.startTime}${total ? `-${addClock(session.startTime, total)}` : ''}`]
    .filter(Boolean)
    .join('  ·  ');
  doc.text(clean([when, session.team].filter(Boolean).join('  ·  ')), M, 28.5);
  w.y = 42;

  const meta = [
    ['Total time', formatMinutes(total)],
    ['Planned', session.plannedDuration ? formatMinutes(session.plannedDuration) : ''],
    ['Drills', String(session.items.length)],
  ].filter(([, v]) => v);
  const colW = CW / meta.length;
  meta.forEach(([k, v], i) => {
    w.font(7.5, 'bold', MUTED);
    doc.text(k.toUpperCase(), M + i * colW, w.y);
    w.font(12, 'bold', INK);
    doc.text(v, M + i * colW, w.y + 6);
  });
  w.y += 12;

  if (total > 0) {
    // Timeline bar, coloured by drill category.
    let x = M;
    for (const it of session.items) {
      const dr = drillsById.get(it.drillId);
      const bw = (CW * (it.duration || 0)) / total;
      doc.setFillColor(...hex(categoryColor(dr?.category ?? '')));
      doc.rect(x, w.y, Math.max(0, bw - 0.6), 5, 'F');
      x += bw;
    }
    w.y += 10;
  }

  if (session.objective.trim()) {
    w.heading('Session objective');
    w.paragraph(session.objective);
  }

  w.heading('Plan');
  const cols = { n: M, time: M + 7, thumb: M + 24, title: M + 62, cat: M + 140, dur: M + CW };
  const THUMB_W = 33;
  const THUMB_H = 22;
  const ROW_H = THUMB_H + 4;
  w.font(7.5, 'bold', MUTED);
  doc.text('#', cols.n, w.y);
  doc.text(session.startTime ? 'TIME' : 'START', cols.time, w.y);
  doc.text('DRILL', cols.thumb, w.y);
  doc.text('FOCUS', cols.cat, w.y);
  doc.text('MIN', cols.dur, w.y, { align: 'right' });
  w.y += 2.5;
  let elapsed = 0;
  for (let i = 0; i < session.items.length; i++) {
    const it = session.items[i];
    const dr = drillsById.get(it.drillId);
    w.ensure(ROW_H);
    doc.setDrawColor(...hex('#e1e6e2'));
    doc.setLineWidth(0.2);
    doc.line(M, w.y, M + CW, w.y);
    const top = w.y + 2;
    const rowY = top + 5;
    w.font(10, 'bold', BRAND);
    doc.text(String(i + 1), cols.n, rowY);
    w.font(10, 'normal', INK);
    doc.text(session.startTime ? addClock(session.startTime, elapsed) : `${elapsed}'`, cols.time, rowY);
    if (dr?.diagrams[0]) {
      const vb = viewBox(dr.diagrams[0].pitch);
      const aspect = vb.w / vb.h;
      const tw = Math.min(THUMB_W, THUMB_H * aspect);
      await drawDiagram(doc, dr.diagrams[0], cols.thumb + (THUMB_W - tw) / 2, top, tw, tw / aspect);
    }
    w.font(10, 'bold', INK);
    doc.text(clean(dr?.title || '(deleted drill)'), cols.title, rowY, { maxWidth: 74 });
    if (it.notes.trim()) {
      w.font(8.5, 'normal', MUTED);
      const notes: string[] = doc.splitTextToSize(clean(it.notes), 74);
      doc.text(notes.slice(0, 3), cols.title, rowY + 5);
    }
    w.font(9, 'normal', MUTED);
    doc.text(clean(dr?.category ?? ''), cols.cat, rowY, { maxWidth: 28 });
    w.font(10, 'bold', INK);
    doc.text(String(it.duration || 0), cols.dur, rowY, { align: 'right' });
    w.y += ROW_H;
    elapsed += it.duration || 0;
  }
  w.y += 2;

  if (session.notes.trim()) {
    w.heading('Notes');
    w.paragraph(session.notes);
  }

  // One section per drill, each on a fresh page.
  elapsed = 0;
  for (let i = 0; i < session.items.length; i++) {
    const it = session.items[i];
    const dr = drillsById.get(it.drillId);
    const start = elapsed;
    elapsed += it.duration || 0;
    if (!dr) continue;
    doc.addPage();
    w.y = M;
    const time = session.startTime
      ? `${addClock(session.startTime, start)}-${addClock(session.startTime, elapsed)}`
      : `${start}'-${elapsed}'`;
    await drawDrill(w, { ...dr, duration: it.duration || dr.duration }, {
      banner: `Part ${i + 1} of ${session.items.length}  ·  ${time}`,
      notes: it.notes,
    });
  }

  addFooters(doc, [session.title || 'Session plan', formatDate(session.date)].filter(Boolean).join('  ·  '));
  return doc;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
