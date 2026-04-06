const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Rimuove emoji e caratteri non-Latin (pdfkit usa font Helvetica built-in)
function clean(str) {
  return (str || '').replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim();
}

// Rimuove markdown inline (**grassetto**, *corsivo*)
function stripMd(str) {
  return str.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
}

// ── Colori ────────────────────────────────────────────────────────────────────
const C = {
  green:      '#4A6B47',
  greenLight: '#7D9B76',
  greenBg:    '#F0F7EE',
  greenBoxBg: '#F8FBF8',
  dark:       '#1C1C1E',
  dark2:      '#2C2C2E',
  grey:       '#8A8A8A',
  separator:  '#EEEEEE',
  white:      '#FFFFFF',
};

// ── Endpoint PDF ──────────────────────────────────────────────────────────────
app.post('/genera-pdf', (req, res) => {
  const { specialist, messages, summary } = req.body || {};

  if (!specialist) {
    return res.status(400).json({ error: 'Dati mancanti.' });
  }
  if (!summary && (!Array.isArray(messages) || messages.length === 0)) {
    return res.status(400).json({ error: 'Conversazione vuota.' });
  }

  const spName  = clean(specialist.name) || 'Specialista';
  const spIcon  = specialist.icon  || '';
  const dateStr = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const dateISO = new Date().toISOString().slice(0, 10);
  const fname   = `consulto-${spName.toLowerCase()}-${dateISO}.pdf`;

  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  doc.pipe(res);

  const PW = doc.page.width;   // 595.28 pt
  const PH = doc.page.height;  // 841.89 pt
  const MARGIN     = 55;
  const COL_W      = PW - MARGIN * 2;
  const TOP_BAND   = 8;
  const CONTENT_TOP = MARGIN + TOP_BAND + 10;
  const FOOTER_Y   = PH - 30;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGINA 1 — COPERTINA
  // ═══════════════════════════════════════════════════════════════════════════

  // Sfondo pieno verde
  doc.rect(0, 0, PW, PH).fill(C.green);

  // Cerchio decorativo in alto a destra (stroke bianco semitrasparente)
  doc.save()
     .circle(PW - 30, -30, 220)
     .lineWidth(1)
     .strokeColor(C.white)
     .opacity(0.08)
     .stroke()
     .restore();

  doc.save()
     .circle(PW + 20, -20, 160)
     .lineWidth(0.6)
     .strokeColor(C.white)
     .opacity(0.06)
     .stroke()
     .restore();

  // Cerchio piccolo in basso a sinistra
  doc.save()
     .circle(-40, PH + 30, 180)
     .lineWidth(1)
     .strokeColor(C.white)
     .opacity(0.06)
     .stroke()
     .restore();

  // Testo centrato verticalmente — blocco centrale ~230pt di altezza
  const coverCenterY = PH / 2 - 100;

  // Icona specialista (solo ASCII, emoji viene rimossa dal clean)
  // Usiamo un cerchio con le iniziali come fallback elegante
  doc.save()
     .circle(PW / 2, coverCenterY, 42)
     .fillColor(C.white)
     .opacity(0.12)
     .fill()
     .restore();

  // Simbolo del cerchio bianco trasparente (bordo)
  doc.save()
     .circle(PW / 2, coverCenterY, 42)
     .lineWidth(1.5)
     .strokeColor(C.white)
     .opacity(0.3)
     .stroke()
     .restore();

  // Iniziale specialista nel cerchio
  const initials = spName.slice(0, 1).toUpperCase();
  doc.fillColor(C.white).opacity(0.9)
     .font('Helvetica-Bold').fontSize(26)
     .text(initials, PW / 2 - 9, coverCenterY - 14);

  // Nome specialista
  doc.opacity(1)
     .fillColor(C.white)
     .font('Helvetica-Bold').fontSize(28)
     .text(spName, MARGIN, coverCenterY + 62, { width: COL_W, align: 'center' });

  // Sottotitolo
  doc.fillColor(C.white).opacity(0.7)
     .font('Helvetica').fontSize(12)
     .text('Consulto Personale', MARGIN, coverCenterY + 100, { width: COL_W, align: 'center' });

  // Linea decorativa
  const lineY = coverCenterY + 130;
  doc.save()
     .moveTo(PW / 2 - 40, lineY)
     .lineTo(PW / 2 + 40, lineY)
     .lineWidth(0.7)
     .strokeColor(C.white)
     .opacity(0.35)
     .stroke()
     .restore();

  // Data
  doc.fillColor(C.white).opacity(0.6)
     .font('Helvetica').fontSize(11)
     .text(dateStr, MARGIN, lineY + 14, { width: COL_W, align: 'center' });

  // Brand in basso
  doc.fillColor(C.white).opacity(0.4)
     .font('Helvetica').fontSize(10)
     .text('Il Mio Benessere', MARGIN, PH - 48, { width: COL_W, align: 'center' });

  // Piccola linea brand
  doc.save()
     .moveTo(PW / 2 - 20, PH - 56)
     .lineTo(PW / 2 + 20, PH - 56)
     .lineWidth(0.5)
     .strokeColor(C.white)
     .opacity(0.2)
     .stroke()
     .restore();

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGINE CONTENUTO
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();

  // Variabile cursore y — condivisa tra funzioni di rendering
  let y = CONTENT_TOP;

  // ── Banda colorata in alto ─────────────────────────────────────────────────
  function drawTopBand() {
    doc.rect(0, 0, PW, TOP_BAND).fill(C.greenLight);
  }
  drawTopBand();

  // ── Footer su ogni pagina (disegnato alla fine con bufferPages) ────────────
  function drawFooter(pageNum, total) {
    doc.save();
    // Linea separatrice
    doc.moveTo(MARGIN, FOOTER_Y - 6)
       .lineTo(PW - MARGIN, FOOTER_Y - 6)
       .lineWidth(0.4)
       .strokeColor(C.separator)
       .stroke();

    doc.fillColor(C.grey).font('Helvetica').fontSize(7.5);
    // Sinistra
    doc.text(`Il Mio Benessere \u2014 ${spName}`, MARGIN, FOOTER_Y, { width: COL_W * 0.5 });
    // Centro
    doc.text('\u00B7\u00B7\u00B7', PW / 2 - 8, FOOTER_Y, { width: 16, align: 'center' });
    // Destra
    doc.text(`Pagina ${pageNum} / ${total}`, MARGIN, FOOTER_Y, { width: COL_W, align: 'right' });
    doc.restore();
  }

  // ── Spazio disponibile (escluso footer) ───────────────────────────────────
  const BOTTOM = FOOTER_Y - 20;

  function ensureSpace(needed) {
    if (y + needed > BOTTOM) {
      doc.addPage();
      drawTopBand();
      y = CONTENT_TOP;
    }
  }

  // ── Testo generico con tracciamento y manuale ──────────────────────────────
  function writeText(text, x, width, opts = {}) {
    const txtOpts = { width, ...opts };
    const h = doc.heightOfString(text, txtOpts);
    ensureSpace(h + (opts.gap || 0));
    doc.text(text, x, y, txtOpts);
    y += h + (opts.gap !== undefined ? opts.gap : 2);
  }

  // ── Render bullet point con pallino grafico ────────────────────────────────
  function writeBullet(text) {
    const indent = 16;
    const txtX   = MARGIN + indent;
    const txtW   = COL_W - indent;
    const lineH  = doc.heightOfString(text, { width: txtW });
    ensureSpace(lineH + 4);
    // Pallino pieno verde
    doc.save()
       .circle(MARGIN + 5, y + 4.5, 2.2)
       .fillColor(C.greenLight)
       .fill()
       .restore();
    doc.text(text, txtX, y, { width: txtW });
    y += lineH + 4;
  }

  // ── Render linee di un messaggio (markdown leggero) ───────────────────────
  function renderLines(rawText, isUser) {
    const lines = rawText.split('\n');
    for (const line of lines) {
      const ulM  = line.match(/^[-\u2022]\s+(.*)/);
      const olM  = line.match(/^\d+\.\s+(.*)/);
      const h2M  = line.match(/^#{2,3}\s+(.*)/);
      const trim = line.trim();

      if (!trim) { y += 4; continue; }

      if (h2M) {
        const txt = clean(stripMd(h2M[1]));
        if (!txt) continue;
        ensureSpace(18);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(isUser ? C.green : C.dark2);
        writeText(txt, MARGIN + (isUser ? 12 : 14), COL_W - (isUser ? 12 : 14), { gap: 4 });
        doc.font('Helvetica').fontSize(10.5).fillColor(isUser ? C.dark : C.dark2);
      } else if (ulM) {
        const txt = clean(stripMd(ulM[1]));
        if (!txt) continue;
        writeBullet(txt);
      } else if (olM) {
        const txt = clean(stripMd(olM[1]));
        if (!txt) continue;
        writeBullet(txt); // trattato come bullet
      } else {
        const txt = clean(stripMd(trim));
        if (!txt) continue;
        writeText(txt, MARGIN + (isUser ? 12 : 14), COL_W - (isUser ? 12 : 14), { gap: 3 });
      }
    }
  }

  // ── Render sezione FONTI ──────────────────────────────────────────────────
  function renderSources(sourcesLines) {
    if (!sourcesLines.length) return;

    // Stima altezza totale del box
    const itemH = 14;
    const boxH  = 16 + sourcesLines.length * itemH + 10;
    ensureSpace(boxH + 10);

    y += 6;
    // Box con bordo e sfondo
    doc.save()
       .roundedRect(MARGIN, y, COL_W, boxH, 8)
       .fillAndStroke(C.greenBoxBg, C.greenLight);
    doc.lineWidth(0.5).restore();

    y += 10;

    // Header FONTI
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.green);
    doc.text('FONTI', MARGIN + 12, y, { width: COL_W - 24 });
    y += 14;

    doc.font('Helvetica').fontSize(9).fillColor(C.green);
    for (const src of sourcesLines) {
      const txt = '\u2192  ' + src;
      const h = doc.heightOfString(txt, { width: COL_W - 24 });
      doc.text(txt, MARGIN + 12, y, { width: COL_W - 24 });
      y += h + 4;
    }
    y += 6;
  }

  // ── Render singolo messaggio ──────────────────────────────────────────────
  function renderMessage(m) {
    if (!m.displayText) return;

    const isUser = m.role === 'user';
    let rawText  = m.displayText;

    // Estrai sezione FONTI
    let sourcesLines = [];
    const srcMatch = rawText.match(/FONTI:\s*\n([\s\S]*?)$/m);
    if (srcMatch) {
      sourcesLines = srcMatch[1]
        .split('\n')
        .filter(l => l.trim().startsWith('-'))
        .map(l => clean(l.replace(/^-\s*/, '')).replace(/\|/g, ' \u2014 '))
        .filter(Boolean);
      rawText = rawText.replace(srcMatch[0], '').trim();
    }

    ensureSpace(40);
    y += 6;

    if (isUser) {
      // ── Label TU ──────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.green);
      doc.text('TU', MARGIN, y, { width: COL_W, characterSpacing: 1.5 });
      y += 13;

      // Stima altezza testo per box arrotondato
      doc.font('Helvetica').fontSize(10.5).fillColor(C.dark);
      const textH = doc.heightOfString(
        clean(stripMd(rawText)),
        { width: COL_W - 24 }
      );
      const boxH = textH + 24;
      ensureSpace(boxH);

      // Box sfondo verde chiaro
      doc.save()
         .roundedRect(MARGIN, y, COL_W, boxH, 10)
         .fill(C.greenBg)
         .restore();

      const boxTop = y + 12;
      y = boxTop;
      doc.font('Helvetica').fontSize(10.5).fillColor(C.dark);
      renderLines(rawText, true);
      y = boxTop + boxH - 8;

    } else {
      // ── Label SPECIALISTA ─────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.greenLight);
      doc.text(spName.toUpperCase(), MARGIN + 14, y, {
        width: COL_W - 14,
        characterSpacing: 1.2,
      });
      y += 13;

      // Calcola altezza contenuto per linea verticale
      const startY = y;
      doc.font('Helvetica').fontSize(10.5).fillColor(C.dark2);

      // Salviamo y iniziale, rendiamo il testo, poi disegniamo la linea
      const yBefore = y;
      renderLines(rawText, false);
      renderSources(sourcesLines);
      const yAfter = y;

      // Linea verticale verde a sinistra
      const lineH = yAfter - yBefore;
      if (lineH > 0) {
        doc.save()
           .moveTo(MARGIN, yBefore)
           .lineTo(MARGIN, yAfter - 4)
           .lineWidth(2.5)
           .strokeColor(C.greenLight)
           .stroke()
           .restore();
      }

      // Se ci sono fonti erano già renderizzate dentro renderLines path
      // per il messaggio utente non ci sono fonti
    }

    y += 10;
  }

  // ── Rendering contenuto ────────────────────────────────────────────────────
  if (summary) {
    doc.font('Helvetica').fontSize(10.5).fillColor(C.dark2);
    const yBefore = y;
    renderLines(summary, false);
    const yAfter = y;
    if (yAfter > yBefore) {
      doc.save()
         .moveTo(MARGIN, yBefore)
         .lineTo(MARGIN, yAfter - 4)
         .lineWidth(2.5)
         .strokeColor(C.greenLight)
         .stroke()
         .restore();
    }
  } else {
    for (const m of messages) {
      renderMessage(m);
      // Separatore leggero tra messaggi
      ensureSpace(12);
      doc.save()
         .moveTo(MARGIN + 20, y)
         .lineTo(PW - MARGIN - 20, y)
         .lineWidth(0.3)
         .strokeColor(C.separator)
         .stroke()
         .restore();
      y += 10;
    }
  }

  // ── Blocco finale centrato ────────────────────────────────────────────────
  ensureSpace(60);
  y += 20;

  // Linea verde finale
  doc.save()
     .moveTo(PW / 2 - 50, y)
     .lineTo(PW / 2 + 50, y)
     .lineWidth(1)
     .strokeColor(C.greenLight)
     .stroke()
     .restore();
  y += 14;

  doc.fillColor(C.grey).font('Helvetica').fontSize(9)
     .text(`Consulto generato il ${dateStr}`, MARGIN, y, { width: COL_W, align: 'center' });
  y += 14;

  doc.fillColor(C.green).font('Helvetica-Bold').fontSize(8)
     .text('Il Mio Benessere', MARGIN, y, { width: COL_W, align: 'center' });

  // ── Footer su tutte le pagine (esclusa copertina = pagina 0) ─────────────
  doc.flushPages();
  const range = doc.bufferedPageRange();
  const total = range.count;

  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    if (i === 0) continue; // salta copertina
    drawFooter(i, total - 1); // numerazione esclude copertina
  }

  doc.end();
});

// ── Avvio server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server avviato → http://localhost:${PORT}`);
});
