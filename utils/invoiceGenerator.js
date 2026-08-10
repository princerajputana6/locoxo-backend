import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import fs from 'fs';
import path from 'path';
import company from '../config/company.js';
import { rupeesInWords } from './numberToWords.js';

// Best-effort enrichment: pull the shipment (AWB / courier) and each line's
// product code + HSN. Never throws — the invoice renders regardless.
const enrich = async (order) => {
    const out = { awb: '', courier: '', codes: {} };
    try {
        const shipmentModel = (await import('../models/shipmentModel.js')).default;
        const s = await shipmentModel.findOne({ orderId: order._id }).lean();
        if (s) { out.awb = s.awb || ''; out.courier = s.provider || ''; }
    } catch { /* ignore */ }
    try {
        const productModel = (await import('../models/productModel.js')).default;
        const ids = (order.items || []).map((i) => i.productId).filter(Boolean);
        if (ids.length) {
            const prods = await productModel.find({ _id: { $in: ids } }, 'productCode').lean();
            prods.forEach((p) => { out.codes[String(p._id)] = p.productCode; });
        }
    } catch { /* ignore */ }
    return out;
};

const money = (n) => Number(n || 0).toFixed(2);
const fmtDate = (d) => new Date(d || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const generateInvoice = async (orderData) => {
    // Work on a plain object whether a mongoose doc or literal is passed.
    const order = typeof orderData?.toObject === 'function' ? orderData.toObject() : { ...orderData };
    const meta = await enrich(order);

    const invoicesDir = path.join(process.cwd(), 'invoices');
    if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
    const invoicePath = path.join(invoicesDir, `invoice-${order.orderNumber}.pdf`);

    // Pre-render the order-number barcode (Code-128).
    let orderBarcode = null;
    try {
        orderBarcode = await bwipjs.toBuffer({ bcid: 'code128', text: String(order.orderNumber), scale: 2, height: 8, includetext: true, textsize: 7, textxalign: 'center' });
    } catch { /* skip */ }
    let awbBarcode = null;
    if (meta.awb) {
        try { awbBarcode = await bwipjs.toBuffer({ bcid: 'code128', text: String(meta.awb), scale: 2, height: 8, includetext: true, textsize: 7, textxalign: 'center' }); } catch { /* skip */ }
    }

    // Tax model: intra-state (buyer state == seller state) → CGST+SGST, else IGST.
    const buyerState = (order.address?.state || '').trim().toLowerCase();
    const sellerState = (company.address.state || '').trim().toLowerCase();
    const isIntraState = buyerState && buyerState === sellerState;
    const rate = company.gstRate; // %

    // Per-line GST breakdown from the tax-inclusive selling price.
    const lines = (order.items || []).map((it, idx) => {
        const gross = Number(it.price || 0) * Number(it.quantity || 1);   // tax-inclusive amount
        const taxable = gross / (1 + rate / 100);
        const tax = gross - taxable;
        const unitTaxable = taxable / Number(it.quantity || 1);
        return {
            sr: idx + 1,
            name: it.name || '',
            code: meta.codes[String(it.productId)] || '',
            size: it.size, color: it.color,
            qty: Number(it.quantity || 1),
            rate: unitTaxable,       // pre-tax unit rate
            discount: 0,
            taxable, tax, amount: gross,
        };
    });

    const totals = lines.reduce((a, l) => ({
        qty: a.qty + l.qty, taxable: a.taxable + l.taxable, tax: a.tax + l.tax, amount: a.amount + l.amount,
    }), { qty: 0, taxable: 0, tax: 0, amount: 0 });

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 24 });
            const stream = fs.createWriteStream(invoicePath);
            doc.pipe(stream);

            const L = 24, R = 571;                 // page content bounds (A4 width 595)
            const W = R - L;
            const box = (x, y, w, h) => doc.rect(x, y, w, h).lineWidth(0.6).strokeColor('#333').stroke();
            const label = (t, x, y, w) => doc.font('Helvetica').fontSize(6.5).fillColor('#666').text(t, x + 3, y + 2, { width: (w || 100) - 6 });
            const value = (t, x, y, w, opt = {}) => doc.font(opt.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opt.size || 8).fillColor('#111').text(String(t ?? ''), x + 3, y + 9, { width: (w || 100) - 6, ...opt });

            // ── Header: logo + Tax Invoice title ────────────────────────────────
            const logoPath = path.join(process.cwd(), 'assets', 'logo.png');
            if (fs.existsSync(logoPath)) { try { doc.image(logoPath, L, 26, { width: 90 }); } catch { /* ignore */ } }
            doc.font('Helvetica-Bold').fontSize(15).fillColor('#111').text('Tax Invoice', L, 30, { width: W, align: 'right' });
            doc.font('Helvetica').fontSize(7).fillColor('#666').text('Original for Recipient', L, 48, { width: W, align: 'right' });

            let y = 66;
            const colSellerW = W * 0.42, colMetaW = W * 0.33, colDateW = W - colSellerW - colMetaW;
            const headerH = 92;
            box(L, y, colSellerW, headerH);
            box(L + colSellerW, y, colMetaW, headerH);
            box(L + colSellerW + colMetaW, y, colDateW, headerH);

            // Seller block
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(company.legalName, L + 4, y + 4, { width: colSellerW - 8 });
            doc.font('Helvetica').fontSize(7).fillColor('#333');
            const a = company.address;
            doc.text(`${a.line1}${a.line2 ? ', ' + a.line2 : ''}`, L + 4, doc.y + 1, { width: colSellerW - 8 });
            doc.text(`${a.city}, ${a.state} - ${a.pincode}, ${a.country}`, L + 4, doc.y + 1, { width: colSellerW - 8 });
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111').text(`GSTIN: ${company.gstin}`, L + 4, doc.y + 3, { width: colSellerW - 8 });
            doc.font('Helvetica').fontSize(7).fillColor('#333').text(`State: ${a.state}, Code: ${a.stateCode}`, L + 4, doc.y + 1, { width: colSellerW - 8 });

            // Invoice meta block (middle)
            const mx = L + colSellerW;
            const paymentMode = (order.paymentMethod || '').toUpperCase() === 'COD' ? 'COD' : 'PREPAID';
            let my = y + 3;
            const metaRow = (k, v) => {
                doc.font('Helvetica').fontSize(6.5).fillColor('#666').text(k, mx + 4, my, { width: colMetaW - 8 });
                doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111').text(v, mx + 4, my + 7, { width: colMetaW - 8 });
                my += 17;
            };
            metaRow('Invoice No', order.orderNumber);
            metaRow('Order No', order.orderNumber);
            metaRow('Order Date', fmtDate(order.date || order.createdAt));

            // Date block (right)
            const dx = L + colSellerW + colMetaW;
            let dy = y + 3;
            const dateRow = (k, v) => {
                doc.font('Helvetica').fontSize(6.5).fillColor('#666').text(k, dx + 4, dy, { width: colDateW - 8 });
                doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111').text(v, dx + 4, dy + 7, { width: colDateW - 8 });
                dy += 17;
            };
            dateRow('Invoice Date', fmtDate(order.date || order.createdAt));
            dateRow('Portal', company.brand);
            dateRow('Payment Mode', paymentMode);

            // ── Bill To / Ship To / Dispatch ────────────────────────────────────
            y += headerH;
            const partyH = 78;
            const p1 = W * 0.35, p2 = W * 0.35, p3 = W - p1 - p2;
            box(L, y, p1, partyH);
            box(L + p1, y, p2, partyH);
            box(L + p1 + p2, y, p3, partyH);

            const ad = order.address || {};
            const addrLines = [
                ad.name,
                [ad.addressLine1, ad.addressLine2].filter(Boolean).join(', '),
                `${ad.city || ''}${ad.state ? ', ' + ad.state : ''}${ad.pincode ? ' - ' + ad.pincode : ''}`,
                ad.country || 'India',
                ad.phone ? `Ph: ${ad.phone}` : '',
            ].filter(Boolean);

            const party = (title, x, w) => {
                doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111').text(title, x + 4, y + 4, { width: w - 8 });
                doc.font('Helvetica').fontSize(7).fillColor('#333');
                let py = y + 15;
                addrLines.forEach((ln) => { doc.text(ln, x + 4, py, { width: w - 8 }); py = doc.y + 1; });
            };
            party('Bill To', L, p1);
            party('Ship To', L + p1, p2);

            // Dispatch block
            const ex = L + p1 + p2;
            doc.font('Helvetica').fontSize(6.5).fillColor('#666').text('Dispatch Through', ex + 4, y + 4, { width: p3 - 8 });
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111').text(meta.courier ? meta.courier.toUpperCase() : '—', ex + 4, y + 12, { width: p3 - 8 });
            doc.font('Helvetica').fontSize(6.5).fillColor('#666').text('AWB No', ex + 4, y + 26, { width: p3 - 8 });
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111').text(meta.awb || '—', ex + 4, y + 34, { width: p3 - 8 });
            if (awbBarcode) { try { doc.image(awbBarcode, ex + 4, y + 46, { width: p3 - 8, height: 26 }); } catch { /* ignore */ } }
            else if (orderBarcode) { try { doc.image(orderBarcode, ex + 4, y + 46, { width: p3 - 8, height: 26 }); } catch { /* ignore */ } }

            // ── Items table ─────────────────────────────────────────────────────
            y += partyH;
            const taxLabel = isIntraState ? `CGST+SGST` : `IGST`;
            // column x positions and widths
            const cols = [
                { key: 'sr', label: 'Sr', w: 22, align: 'center' },
                { key: 'name', label: 'Product Name', w: 150, align: 'left' },
                { key: 'code', label: 'Product Code', w: 92, align: 'left' },
                { key: 'qty', label: 'Qty', w: 28, align: 'center' },
                { key: 'rate', label: 'Rate', w: 55, align: 'right' },
                { key: 'discount', label: 'Discount', w: 50, align: 'right' },
                { key: 'taxable', label: 'Taxable\nValue', w: 60, align: 'right' },
                { key: 'tax', label: `${taxLabel}\n(${rate}%)`, w: 55, align: 'right' },
                { key: 'amount', label: 'Amount', w: W - (22 + 150 + 92 + 28 + 55 + 50 + 60 + 55), align: 'right' },
            ];
            const colX = [];
            let cx = L;
            cols.forEach((c) => { colX.push(cx); cx += c.w; });

            // header row
            const thH = 22;
            doc.rect(L, y, W, thH).fillColor('#f0f0f0').fill();
            doc.strokeColor('#333').lineWidth(0.6);
            cols.forEach((c, i) => {
                doc.rect(colX[i], y, c.w, thH).stroke();
                doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#111').text(c.label, colX[i] + 2, y + 4, { width: c.w - 4, align: c.align });
            });
            y += thH;

            // body rows
            doc.font('Helvetica').fontSize(7.5).fillColor('#111');
            lines.forEach((l) => {
                const nameH = doc.heightOfString(l.name, { width: cols[1].w - 4, fontSize: 7.5 });
                const rowH = Math.max(24, nameH + 14);
                cols.forEach((c, i) => { doc.rect(colX[i], y, c.w, rowH).lineWidth(0.5).strokeColor('#999').stroke(); });
                doc.fillColor('#111').font('Helvetica').fontSize(7.5);
                doc.text(String(l.sr), colX[0] + 2, y + 5, { width: cols[0].w - 4, align: 'center' });
                doc.text(l.name, colX[1] + 2, y + 4, { width: cols[1].w - 4 });
                doc.fillColor('#333').fontSize(7).text(l.code || '—', colX[2] + 2, y + 4, { width: cols[2].w - 4 });
                doc.fontSize(6.3).fillColor('#666').text(`HSN: ${company.hsnCode}`, colX[2] + 2, y + 13, { width: cols[2].w - 4 });
                if (l.size || l.color) doc.fontSize(6.3).fillColor('#666').text([l.size, l.color].filter(Boolean).join(' · '), colX[1] + 2, y + 4 + nameH, { width: cols[1].w - 4 });
                doc.fillColor('#111').fontSize(7.5);
                doc.text(String(l.qty), colX[3] + 2, y + 5, { width: cols[3].w - 4, align: 'center' });
                doc.text(money(l.rate), colX[4] + 2, y + 5, { width: cols[4].w - 4, align: 'right' });
                doc.text(money(l.discount), colX[5] + 2, y + 5, { width: cols[5].w - 4, align: 'right' });
                doc.text(money(l.taxable), colX[6] + 2, y + 5, { width: cols[6].w - 4, align: 'right' });
                doc.text(money(l.tax), colX[7] + 2, y + 5, { width: cols[7].w - 4, align: 'right' });
                doc.text(money(l.amount), colX[8] + 2, y + 5, { width: cols[8].w - 4, align: 'right' });
                y += rowH;
            });

            // totals row
            const totH = 20;
            doc.rect(L, y, W, totH).lineWidth(0.6).strokeColor('#333').stroke();
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111');
            doc.text('Total', colX[1] + 2, y + 6, { width: cols[1].w - 4 });
            doc.text(String(totals.qty), colX[3] + 2, y + 6, { width: cols[3].w - 4, align: 'center' });
            doc.text(money(totals.taxable), colX[6] + 2, y + 6, { width: cols[6].w - 4, align: 'right' });
            doc.text(money(totals.tax), colX[7] + 2, y + 6, { width: cols[7].w - 4, align: 'right' });
            doc.text(money(totals.amount), colX[8] + 2, y + 6, { width: cols[8].w - 4, align: 'right' });
            y += totH + 6;

            // ── Amount in words + reverse charge ────────────────────────────────
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111').text('Amount Chargeable (in words)', L, y);
            doc.font('Helvetica').fontSize(8.5).fillColor('#111').text(rupeesInWords(totals.amount), L, doc.y + 1, { width: W * 0.62 });
            const taxSplit = isIntraState
                ? `CGST @${rate / 2}%: ${money(totals.tax / 2)}   SGST @${rate / 2}%: ${money(totals.tax / 2)}`
                : `IGST @${rate}%: ${money(totals.tax)}`;
            doc.font('Helvetica').fontSize(7.5).fillColor('#333').text(taxSplit, L, doc.y + 3, { width: W });
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111').text('Tax is payable on reverse charge basis: No', L, doc.y + 3);

            // ── Declaration + signatory ─────────────────────────────────────────
            y = doc.y + 12;
            const decW = W * 0.6;
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111').text('Declaration', L, y);
            doc.font('Helvetica').fontSize(6.8).fillColor('#444').text(
                '1. This is a computer generated invoice and does not require signature or stamp. ' +
                '2. All figures are in INR. 3. Shipping / handling charges are inclusive of GST. ' +
                `4. All disputes are subject to ${company.address.city} (${company.address.stateCode}) jurisdiction only.`,
                L, doc.y + 2, { width: decW });

            const sigX = L + decW + 10, sigW = R - sigX;
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111').text(`For ${company.legalName}`, sigX, y, { width: sigW, align: 'right' });
            doc.font('Helvetica').fontSize(7.5).fillColor('#333').text('Authorised Signatory', sigX, y + 44, { width: sigW, align: 'right' });

            // ── Footer ──────────────────────────────────────────────────────────
            const fy = 800;
            doc.moveTo(L, fy).lineTo(R, fy).lineWidth(0.5).strokeColor('#999').stroke();
            doc.font('Helvetica').fontSize(6.8).fillColor('#666')
                .text('This is a computer generated invoice.', L, fy + 4, { width: W / 2 });
            doc.text(`Powered By ${company.poweredBy}  ·  ${company.website}  ·  ${company.care.email}`, L + W / 2, fy + 4, { width: W / 2, align: 'right' });

            doc.end();
            stream.on('finish', () => resolve(invoicePath));
            stream.on('error', reject);
        } catch (error) {
            reject(error);
        }
    });
};

export default generateInvoice;
