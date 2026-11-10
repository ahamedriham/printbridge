'use strict';
const fs = require('fs');
const { execFile } = require('child_process');
const { BrowserWindow } = require('electron');
const raw = require('./raw');
const log = require('../core/log');

/* ---------- helpers ---------- */
const UNIT_TO_MICRONS = { mm: 1000, cm: 10000, in: 25400 };

function pageSize(cfg) {
  if (!cfg.size) return cfg.pageSize || 'A4';
  if (typeof cfg.size === 'string') return cfg.size;
  const u = UNIT_TO_MICRONS[cfg.units || cfg.size.units || 'mm'] || 1000;
  return { width: Math.round(cfg.size.width * u), height: Math.round(cfg.size.height * u) };
}

function pageSizeInches(cfg) {
  const ps = pageSize(cfg);
  if (typeof ps === 'string') return ps;
  return { width: ps.width / 25400, height: ps.height / 25400 };
}

async function contentFrom(item) {
  if (typeof item === 'string') item = { data: item };
  const flavor = (item.flavor || item.format || 'plain').toLowerCase();
  switch (flavor) {
    case 'plain': case 'html': return { html: String(item.data) };
    case 'base64': return { buffer: Buffer.from(String(item.data), 'base64') };
    case 'file': return { file: String(item.data) };
    case 'url': return { url: String(item.data) };
    default: throw new Error(`Unknown flavor "${flavor}"`);
  }
}

/* ---------- HTML ---------- */
async function loadHtmlWindow(cfg, content) {
  const win = new BrowserWindow({
    show: false,
    width: cfg.width || 800,
    height: cfg.height || 1100,
    webPreferences: { sandbox: true, javascript: true, backgroundThrottling: false },
  });
  const loaded = new Promise((res, rej) => {
    win.webContents.once('did-finish-load', res);
    win.webContents.once('did-fail-load', (_e, code, desc) => rej(new Error(`Load failed: ${desc} (${code})`)));
  });
  if (content.url) await win.loadURL(content.url);
  else if (content.file) await win.loadFile(content.file);
  else await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(content.html || content.buffer.toString('utf8')));
  await loaded;
  // let web fonts / images settle
  await new Promise((r) => setTimeout(r, cfg.settleMs || 300));
  return win;
}

function printOptions(cfg) {
  const o = {
    silent: true,
    printBackground: true,
    deviceName: cfg.printer,
    copies: cfg.copies || 1,
    landscape: /land/i.test(cfg.orientation || ''),
    color: cfg.color !== false,
    pageSize: pageSize(cfg),
  };
  if (cfg.margins === 0 || cfg.margins === 'none') o.margins = { marginType: 'none' };
  else if (cfg.margins && typeof cfg.margins === 'object') o.margins = { marginType: 'custom', ...cfg.margins };
  if (cfg.scaleFactor) o.scaleFactor = cfg.scaleFactor;
  if (cfg.duplex) o.duplexMode = cfg.duplex; // simplex | shortEdge | longEdge
  return o;
}

async function printHtml(cfg, html, item) {
  const content = item ? await contentFrom(item) : { html };
  if (cfg.via === 'pdf') {
    // Render to PDF first, then use the PDF path (more predictable for receipts).
    const pdf = await htmlToPdf(cfg, content);
    return printPdfBuffer(cfg, pdf);
  }
  const win = await loadHtmlWindow(cfg, content);
  try {
    await new Promise((resolve, reject) => {
      win.webContents.print(printOptions(cfg), (ok, reason) => (ok ? resolve() : reject(new Error(`Print failed: ${reason}`))));
    });
  } finally {
    win.destroy();
  }
  return { printer: cfg.printer, type: 'html' };
}

async function htmlToPdf(cfg, content) {
  const win = await loadHtmlWindow(cfg, content);
  try {
    const opts = {
      printBackground: true,
      landscape: /land/i.test(cfg.orientation || ''),
      pageSize: pageSizeInches(cfg),
      preferCSSPageSize: !!cfg.preferCSSPageSize,
    };
    if (cfg.margins === 0 || cfg.margins === 'none') opts.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    else if (cfg.margins && typeof cfg.margins === 'object') opts.margins = cfg.margins;
    return await win.webContents.printToPDF(opts);
  } finally {
    win.destroy();
  }
}

/* ---------- PDF ---------- */
async function printPdfBuffer(cfg, buf) {
  const tmp = raw.tmpFile('.pdf');
  await fs.promises.writeFile(tmp, buf);
  try {
    return await printPdfFile(cfg, tmp);
  } finally {
    fs.unlink(tmp, () => {});
  }
}

async function printPdfFile(cfg, file) {
  if (!cfg.printer) throw new Error('PDF print needs a printer name');
  const copies = cfg.copies || 1;
  if (process.platform === 'win32') {
    const ptp = require('pdf-to-printer');
    const opts = { printer: cfg.printer, copies, silent: true };
    if (cfg.orientation) opts.orientation = /land/i.test(cfg.orientation) ? 'landscape' : 'portrait';
    if (cfg.scale) opts.scale = cfg.scale; // noscale | shrink | fit
    if (cfg.paperSize) opts.paperSize = cfg.paperSize;
    if (cfg.pages) opts.pages = cfg.pages;
    if (cfg.monochrome) opts.monochrome = true;
    await ptp.print(file, opts);
  } else {
    await new Promise((resolve, reject) => {
      const args = ['-d', cfg.printer, '-n', String(copies)];
      if (cfg.orientation && /land/i.test(cfg.orientation)) args.push('-o', 'landscape');
      if (cfg.scale === 'fit' || cfg.scale === 'shrink') args.push('-o', 'fit-to-page');
      if (cfg.paperSize) args.push('-o', `media=${cfg.paperSize}`);
      if (cfg.pages) args.push('-P', String(cfg.pages));
      args.push(file);
      execFile('lp', args, { timeout: 60000 }, (err, _o, stderr) => (err ? reject(new Error((stderr || err.message).trim())) : resolve()));
    });
  }
  return { printer: cfg.printer, type: 'pdf', copies };
}

async function printPdf(cfg, item) {
  const c = await contentFrom(item);
  if (c.file) return printPdfFile(cfg, c.file);
  if (c.buffer) return printPdfBuffer(cfg, c.buffer);
  if (c.url) {
    const res = await fetch(c.url);
    if (!res.ok) throw new Error(`Fetch ${c.url} failed: ${res.status}`);
    return printPdfBuffer(cfg, Buffer.from(await res.arrayBuffer()));
  }
  throw new Error('PDF data must be base64, file or url');
}

/* ---------- Image (png/jpg) -> wrapped in HTML ---------- */
async function printImage(cfg, item) {
  const c = await contentFrom(item);
  let src;
  if (c.url) src = c.url;
  else if (c.file) src = 'file://' + c.file;
  else if (c.buffer) src = 'data:image/png;base64,' + c.buffer.toString('base64');
  else src = c.html;
  const html = `<html><body style="margin:0"><img src="${src}" style="width:100%"></body></html>`;
  return printHtml(cfg, html);
}

/** Dispatch a pixel item: { type: 'html'|'pdf'|'image', flavor, data } */
async function print(cfg, data) {
  const items = Array.isArray(data) ? data : [data];
  const results = [];
  for (const it of items) {
    const fmt = (it.format || it.type || 'html').toLowerCase();
    log.debug('pixel print', fmt, '->', cfg.printer);
    if (fmt === 'pdf') results.push(await printPdf(cfg, it));
    else if (fmt === 'image' || fmt === 'png' || fmt === 'jpg') results.push(await printImage(cfg, it));
    else results.push(await printHtml(cfg, null, it));
  }
  return results;
}

module.exports = { print, printHtml, printPdf, htmlToPdf };
