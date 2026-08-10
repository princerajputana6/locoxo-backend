import bwipjs from 'bwip-js'
import PDFDocument from 'pdfkit'
import { v2 as cloudinary } from 'cloudinary'
import { ensureCloudinary } from '../config/cloudinary.js'
import productModel from '../models/productModel.js'
import orderModel from '../models/orderModel.js'
import stockAdjustmentModel from '../models/stockAdjustmentModel.js'
import { peekSeq } from '../models/counterModel.js'
import { productCode as buildProductCode } from '../utils/barcode.js'
import company from '../config/company.js'

const PLACEHOLDER_IMG = 'https://placehold.co/600x800/0E4F86/FFFFFF?text=LOCOXO'

// Pick the symbology from the code itself: a 12/13-digit numeric string is an
// Indian EAN-13 (scannable), everything else falls back to Code-128 (SKU text).
const pickBcid = (text) => (/^\d{12,13}$/.test(String(text)) ? 'ean13' : 'code128')

// Locate a variant on a product by SKU, or by size+color as a fallback.
const findVariant = (product, { sku, size, color }) => {
    const variants = product.variants || []
    if (sku) return variants.find((v) => v.sku === sku)
    return variants.find((v) => v.size === size && v.color === color)
}

// Write one row to the stock adjustment log. Best-effort — never blocks the
// primary stock write from succeeding.
const logAdjustment = async (product, variant, { type, qtyChange, stockBefore, stockAfter, reason, admin }) => {
    try {
        await stockAdjustmentModel.create({
            productId: product._id,
            productCode: product.productCode,
            productName: product.name,
            sku: variant?.sku,
            size: variant?.size,
            color: variant?.color,
            type,
            qtyChange,
            stockBefore,
            stockAfter,
            reason,
            admin,
        })
    } catch (err) {
        console.log('stock-adjustment log failed:', err.message)
    }
}

// POST /api/inventory/bulk-add
// Accepts EITHER a JSON body { products: [...] } (no images) OR multipart/form-data
// with a `products` JSON string field plus optional per-row image files named
// `image_0`, `image_1`, … (row index). Creates multiple products at once; SKU +
// barcode are auto-generated per variant by the productModel pre-save hook.
export const bulkAddProducts = async (req, res) => {
    try {
        // `products` arrives as a JSON string under multipart, or an array under JSON.
        let products = req.body.products
        if (typeof products === 'string') {
            try { products = JSON.parse(products) } catch { products = null }
        }
        if (!Array.isArray(products) || products.length === 0) {
            return res.json({ success: false, message: 'No products provided' })
        }

        // Map uploaded files by row index: fieldname `image_<i>`.
        const filesByRow = {}
        for (const f of (req.files || [])) {
            const m = /^image_(\d+)$/.exec(f.fieldname)
            if (m) filesByRow[Number(m[1])] = f
        }

        // Configure Cloudinary once up front if any images were uploaded.
        if (Object.keys(filesByRow).length) ensureCloudinary()

        const created = []
        const errors = []

        for (let i = 0; i < products.length; i++) {
            const p = products[i]
            try {
                if (!p.name || p.price === undefined || p.price === '') {
                    throw new Error('Missing name or price')
                }
                const variants = (p.variants || []).map((v) => ({
                    size: v.size || 'Free',
                    color: v.color || 'Default',
                    colorCode: v.colorCode || '',
                    stock: Number(v.stock) || 0,
                }))
                const sizes = p.sizes && p.sizes.length
                    ? p.sizes
                    : [...new Set(variants.map((v) => v.size))]

                // Resolve image: uploaded file → Cloudinary; else a URL passed in the
                // row; else the placeholder.
                let image = [PLACEHOLDER_IMG]
                const file = filesByRow[i]
                if (file) {
                    const up = await cloudinary.uploader.upload(file.path, { resource_type: 'image', folder: 'locoxo/products' })
                    image = [up.secure_url]
                } else if (Array.isArray(p.image) && p.image.length) {
                    image = p.image
                } else if (typeof p.image === 'string' && p.image.trim()) {
                    image = [p.image.trim()]
                }

                const doc = new productModel({
                    name: p.name,
                    description: p.description || p.shortDescription || p.name,
                    shortDescription: p.shortDescription || undefined,
                    price: Number(p.price),                    // MRP
                    discountPrice: p.discountPrice ? Number(p.discountPrice) : undefined,
                    category: p.category || 'Uncategorized',
                    subCategory: p.subCategory || 'General',
                    audience: p.audience || undefined,          // Male/Female/Unisex/Child
                    fabric: p.fabric || undefined,
                    productCode: p.productCode || undefined,    // optional; auto if absent
                    sizes,
                    variants,
                    brand: p.brand || 'LOCOXO',
                    image,
                    status: p.status || 'active',
                    lowStockThreshold: p.lowStockThreshold ?? 5,
                    date: Date.now(),
                })
                await doc.save() // pre-save assigns code + SKU + barcode per variant
                // Seed the adjustment history with each variant's opening stock.
                for (const v of doc.variants) {
                    if (v.stock > 0) {
                        await logAdjustment(doc, v, {
                            type: 'initial', qtyChange: v.stock, stockBefore: 0, stockAfter: v.stock,
                            reason: 'Bulk add — opening stock', admin: req.adminEmail || 'admin',
                        })
                    }
                }
                created.push({ id: doc._id, name: doc.name, productCode: doc.productCode, variants: doc.variants.length })
            } catch (err) {
                errors.push({ row: i + 1, name: p?.name, error: err.message })
            }
        }

        res.json({
            success: true,
            message: `Created ${created.length} product(s)${errors.length ? `, ${errors.length} failed` : ''}`,
            created,
            errors,
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// GET /api/inventory/barcodes/pdf?ids=&category=&search=&filter=
// Streams a printable PDF sheet of barcodes + product details for the
// selected / filtered products. One barcode card per variant.
export const barcodeSheetPdf = async (req, res) => {
    try {
        const { ids, category, search, filter } = req.query

        const dbQuery = {}
        if (ids) dbQuery._id = { $in: ids.split(',').filter(Boolean) }
        if (category && category !== 'all') dbQuery.category = category

        let products = await productModel.find(dbQuery).lean()

        const q = (search || '').trim().toLowerCase()
        if (q) {
            products = products.filter((p) =>
                `${p.name} ${p.brand || ''} ${p.category || ''}`.toLowerCase().includes(q)
            )
        }

        // Build a Code-128-safe code from a product when it has no variant SKUs.
        const productCode = (p) => {
            const base = String(p.name || 'PRD').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'PRD'
            return `${base}-${p._id.toString().slice(-6).toUpperCase()}`
        }

        // Flatten to variant cards, optionally filtering by stock state
        const cards = []
        products.forEach((p) => {
            const threshold = p.lowStockThreshold ?? 5
            let added = 0
                ; (p.variants || []).forEach((v) => {
                    if (!v.sku) return
                    if (filter === 'low' && !(v.stock <= threshold && v.stock > 0)) return
                    if (filter === 'out' && v.stock > 0) return
                    cards.push({
                        name: p.name, price: p.price, category: p.category,
                        size: v.size, color: v.color, sku: v.sku, stock: v.stock,
                        barcode: v.barcode || v.sku, human: v.humanBarcode || '',
                    })
                    added++
                })

            // Fallback: a product with no SKU'd variants still gets one product-level
            // barcode (so any selected product can be downloaded). Skipped for the
            // stock-specific filters, which are inherently variant-level.
            if (added === 0 && filter !== 'low' && filter !== 'out') {
                const totalStock = (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0)
                const pc = productCode(p)
                cards.push({
                    name: p.name, price: p.price, category: p.category,
                    size: '—', color: '—', sku: pc, stock: totalStock,
                    barcode: pc, human: '',
                })
            }
        })

        if (cards.length === 0) {
            // 200 + JSON so the client can show a friendly message (blob content-type check)
            return res.json({ success: false, message: 'No barcodes match the selected filters' })
        }

        // Pre-render barcode PNGs
        const withImages = await Promise.all(cards.map(async (c) => {
            const codeText = c.barcode || c.sku
            const png = await bwipjs.toBuffer({
                bcid: pickBcid(codeText), text: codeText, scale: 3, height: 12,
                includetext: true, textxalign: 'center', textsize: 9,
            })
            return { ...c, png }
        }))

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="locoxo-barcodes-${Date.now()}.pdf"`)

        const doc = new PDFDocument({ size: 'A4', margin: 36 })
        doc.pipe(res)

        // Title
        doc.fontSize(18).fillColor('#062B52').text('LOCOXO — Barcode Sheet', { align: 'left' })
        doc.fontSize(9).fillColor('#888').text(`${withImages.length} labels · generated ${new Date().toLocaleString()}`)
        doc.moveDown(0.5)

        const cols = 3
        const gutter = 12
        const startX = doc.page.margins.left
        const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right
        const cardW = (usableW - gutter * (cols - 1)) / cols
        const cardH = 120
        let x = startX
        let y = doc.y + 6
        let col = 0

        withImages.forEach((c) => {
            if (y + cardH > doc.page.height - doc.page.margins.bottom) {
                doc.addPage(); y = doc.page.margins.top; x = startX; col = 0
            }
            // Card border
            doc.roundedRect(x, y, cardW, cardH, 6).lineWidth(0.7).strokeColor('#dddddd').stroke()
            // Details
            doc.fillColor('#062B52').fontSize(9).font('Helvetica-Bold')
                .text(c.name, x + 8, y + 8, { width: cardW - 16, height: 22, ellipsis: true })
            doc.fillColor('#555').font('Helvetica').fontSize(8)
                .text(`${c.size} · ${c.color}`, x + 8, y + 30, { width: cardW - 16 })
            doc.fillColor('#0E4F86').font('Helvetica-Bold').fontSize(9)
                .text(`Rs.${c.price}`, x + 8, y + 42, { width: cardW - 16 })
            // Barcode
            try {
                doc.image(c.png, x + 8, y + 58, { width: cardW - 16, height: 44, fit: [cardW - 16, 44], align: 'center' })
            } catch { /* skip bad image */ }
            doc.fillColor('#999').fontSize(7).text(`Stock: ${c.stock}`, x + 8, y + cardH - 12, { width: cardW - 16 })

            col++
            if (col >= cols) { col = 0; x = startX; y += cardH + gutter }
            else { x += cardW + gutter }
        })

        doc.end()
    } catch (error) {
        console.log(error)
        if (!res.headersSent) res.status(500).json({ success: false, message: error.message })
    }
}

// GET /api/inventory/barcode/:sku?w=&h=
export const renderBarcode = async (req, res) => {
    try {
        const { sku } = req.params
        const scale = Math.max(1, Math.min(4, parseInt(req.query.scale) || 2))
        const height = Math.max(8, Math.min(40, parseInt(req.query.h) || 14))
        const png = await bwipjs.toBuffer({
            bcid: pickBcid(sku),
            text: sku,
            scale,
            height,
            includetext: true,
            textxalign: 'center',
            textsize: 10,
        })
        res.set('Content-Type', 'image/png')
        res.set('Cache-Control', 'public, max-age=86400')
        res.send(png)
    } catch (error) {
        console.log(error)
        res.status(400).json({ success: false, message: error.message })
    }
}

const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// GET /api/inventory/label/:sku?name=&price=&size=&color=&stock=
// Returns a self-contained SVG "label" = product details + the barcode in one
// downloadable image. Product details come from query params (the admin UI
// already has them) or are looked up by SKU as a fallback.
export const renderBarcodeLabel = async (req, res) => {
    try {
        const { sku } = req.params
        let { name = '', price = '', size = '', color = '', stock = '', code = '', human = '' } = req.query

        // Fallback: look the variant up by SKU if details weren't supplied.
        if (!name || !code) {
            const p = await productModel.findOne({ 'variants.sku': sku }).lean()
            if (p) {
                name = name || p.name; price = price || p.price
                const v = (p.variants || []).find(v => v.sku === sku)
                if (v) {
                    size = size || v.size; color = color || v.color; stock = stock === '' ? v.stock : stock
                    code = code || v.barcode || v.sku; human = human || v.humanBarcode || ''
                }
            }
        }

        // Prefer the Indian EAN-13 (scannable); fall back to Code-128 of the SKU.
        const codeText = code || sku
        const png = await bwipjs.toBuffer({
            bcid: pickBcid(codeText), text: codeText, scale: 3, height: 12,
            includetext: true, textxalign: 'center', textsize: 9,
        })
        const b64 = png.toString('base64')

        const W = 280, pad = 12
        const hasVariant = size && size !== '—'
        const barY = hasVariant ? 64 : 50
        const H = barY + 66 + (human ? 12 : 0)
        const imgW = W - pad * 2

        // NOTE: `xmlns:xlink` + `xlink:href` (not bare `href`) is required so the
        // embedded barcode renders when the downloaded .svg is opened outside a
        // browser (macOS Preview, Illustrator, Inkscape, PDF converters, label apps).
        const svg =
`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="#ffffff" stroke="#e2e6ec"/>
  <text x="${pad}" y="22" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" fill="#062B52">${xmlEsc(String(name).slice(0, 30))}</text>
  ${hasVariant ? `<text x="${pad}" y="40" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#5b6b80">${xmlEsc(size)}${color ? ' &#183; ' + xmlEsc(color) : ''}</text>` : ''}
  <text x="${pad}" y="${hasVariant ? 58 : 42}" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" fill="#0E4F86">Rs.${xmlEsc(price)}</text>
  <image x="${pad}" y="${barY}" width="${imgW}" height="46" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${b64}"/>
  ${human ? `<text x="${pad}" y="${barY + 58}" font-family="Helvetica,Arial,sans-serif" font-size="8" fill="#5b6b80">${xmlEsc(human)}</text>` : ''}
  <text x="${W - pad}" y="${H - 8}" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="9" fill="#94a3b8">Stock: ${xmlEsc(stock)}</text>
</svg>`

        res.set('Content-Type', 'image/svg+xml')
        res.set('Cache-Control', 'public, max-age=3600')
        res.send(svg)
    } catch (error) {
        console.log(error)
        res.status(400).json({ success: false, message: error.message })
    }
}

// GET /api/inventory/label-pdf/:sku?name=&price=&size=&color=&stock=
// A single printable barcode label as a PDF — the most portable format for
// downloading/printing (opens & prints correctly in every OS and label app).
export const renderBarcodeLabelPdf = async (req, res) => {
    try {
        const { sku } = req.params
        let { name = '', price = '', size = '', color = '', stock = '', code = '', human = '' } = req.query

        if (!name || !code) {
            const p = await productModel.findOne({ 'variants.sku': sku }).lean()
            if (p) {
                name = name || p.name; price = price || p.price
                const v = (p.variants || []).find(v => v.sku === sku)
                if (v) {
                    size = size || v.size; color = color || v.color; stock = stock === '' ? v.stock : stock
                    code = code || v.barcode || v.sku; human = human || v.humanBarcode || ''
                }
            }
        }

        const codeText = code || sku
        const png = await bwipjs.toBuffer({
            bcid: pickBcid(codeText), text: codeText, scale: 3, height: 12,
            includetext: true, textxalign: 'center', textsize: 9,
        })

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${sku}.pdf"`)

        // A compact 60mm × 40mm label (points: 1mm ≈ 2.83465pt)
        const W = 170, H = 113
        const doc = new PDFDocument({ size: [W, H], margin: 8 })
        doc.pipe(res)

        const pad = 8
        const innerW = W - pad * 2
        doc.roundedRect(2, 2, W - 4, H - 4, 6).lineWidth(0.7).strokeColor('#e2e6ec').stroke()
        doc.fillColor('#062B52').font('Helvetica-Bold').fontSize(9)
            .text(String(name).slice(0, 30) || sku, pad, pad, { width: innerW, height: 22, ellipsis: true })
        const hasVariant = size && size !== '—'
        let cy = pad + 14
        if (hasVariant) {
            doc.fillColor('#5b6b80').font('Helvetica').fontSize(7.5)
                .text(`${size}${color ? ' · ' + color : ''}`, pad, cy, { width: innerW })
            cy += 11
        }
        doc.fillColor('#0E4F86').font('Helvetica-Bold').fontSize(9)
            .text(`Rs.${price}`, pad, cy, { width: innerW })
        try {
            doc.image(png, pad, cy + 12, { width: innerW, height: 40, fit: [innerW, 40], align: 'center' })
        } catch { /* skip bad image */ }
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.5)
            .text(`Stock: ${stock}`, pad, H - pad - 8, { width: innerW, align: 'right' })

        doc.end()
    } catch (error) {
        console.log(error)
        if (!res.headersSent) res.status(400).json({ success: false, message: error.message })
    }
}

// GET /api/inventory/summary  — counts for dashboard tiles
export const inventorySummary = async (req, res) => {
    try {
        const products = await productModel.find({}, 'name variants lowStockThreshold onClearance')
        let totalSkus = 0, outOfStock = 0, lowStock = 0, clearance = 0
        products.forEach((p) => {
            const threshold = p.lowStockThreshold ?? 5
            if (p.onClearance) clearance++
            ;(p.variants || []).forEach((v) => {
                totalSkus++
                if (v.stock <= 0) outOfStock++
                else if (v.stock <= threshold) lowStock++
            })
        })
        res.json({ success: true, summary: { totalProducts: products.length, totalSkus, outOfStock, lowStock, clearance } })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// GET /api/inventory/low-stock?limit=
export const listLowStock = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100
        const products = await productModel.find({}, 'name image variants lowStockThreshold').lean()
        const rows = []
        products.forEach((p) => {
            const threshold = p.lowStockThreshold ?? 5
            ;(p.variants || []).forEach((v) => {
                if (v.stock <= threshold) {
                    rows.push({
                        productId: p._id,
                        name: p.name,
                        image: Array.isArray(p.image) ? p.image[0] : p.image,
                        size: v.size, color: v.color, sku: v.sku, stock: v.stock,
                        threshold,
                        outOfStock: v.stock <= 0
                    })
                }
            })
        })
        rows.sort((a, b) => a.stock - b.stock)
        res.json({ success: true, rows: rows.slice(0, limit) })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// PUT /api/inventory/clearance/:id   body: { onClearance, clearanceDiscountPct }
export const updateClearance = async (req, res) => {
    try {
        const { onClearance, clearanceDiscountPct } = req.body
        const update = {}
        if (typeof onClearance === 'boolean') update.onClearance = onClearance
        if (typeof clearanceDiscountPct === 'number') update.clearanceDiscountPct = clearanceDiscountPct
        const product = await productModel.findByIdAndUpdate(req.params.id, update, { new: true })
        if (!product) return res.json({ success: false, message: 'Product not found' })
        res.json({ success: true, product })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// PUT /api/inventory/threshold/:id  body: { lowStockThreshold }
export const updateThreshold = async (req, res) => {
    try {
        const { lowStockThreshold } = req.body
        const product = await productModel.findByIdAndUpdate(
            req.params.id,
            { lowStockThreshold },
            { new: true }
        )
        if (!product) return res.json({ success: false, message: 'Product not found' })
        res.json({ success: true, product })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// POST /api/inventory/backfill-skus  — one-shot, generates SKUs for any variant missing one
export const backfillSkus = async (req, res) => {
    try {
        const products = await productModel.find({})
        let touched = 0
        for (const p of products) {
            let changed = false
            ;(p.variants || []).forEach((v) => {
                if (!v.sku) { v.markModified?.('variants'); changed = true }
                if (!v.barcode) changed = true
            })
            if (changed) {
                await p.save()
                touched++
            }
        }
        res.json({ success: true, message: `Backfilled SKUs on ${touched} products` })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// GET /api/inventory/next-code — preview the next LX2026<NO> product code
// without consuming the sequence (for the "refresh" button in the UI).
export const nextProductCode = async (req, res) => {
    try {
        const year = new Date().getFullYear()
        const seq = await peekSeq(`productCode:${year}`)
        res.json({ success: true, productCode: buildProductCode(year, seq), year, seq })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// POST /api/inventory/restock/:id   body: { sku?, size?, color?, qty, reason? }
// Adds stock to a single variant and logs the adjustment.
export const restockVariant = async (req, res) => {
    try {
        const { sku, size, color, qty, reason } = req.body
        const delta = Number(qty)
        if (!Number.isFinite(delta) || delta === 0) {
            return res.json({ success: false, message: 'Enter a non-zero quantity' })
        }
        const product = await productModel.findById(req.params.id)
        if (!product) return res.json({ success: false, message: 'Product not found' })
        const variant = findVariant(product, { sku, size, color })
        if (!variant) return res.json({ success: false, message: 'Variant not found' })

        const before = variant.stock || 0
        variant.stock = Math.max(0, before + delta)
        await product.save()
        await logAdjustment(product, variant, {
            type: 'restock', qtyChange: variant.stock - before, stockBefore: before, stockAfter: variant.stock,
            reason: reason || 'Restock', admin: req.adminEmail || 'admin',
        })
        res.json({ success: true, message: 'Stock updated', variant: { sku: variant.sku, stock: variant.stock } })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// POST /api/inventory/adjust/:id   body: { sku?, size?, color?, newStock, reason? }
// Sets a variant's stock to an absolute value (stock correction) and logs it.
export const adjustVariant = async (req, res) => {
    try {
        const { sku, size, color, newStock, reason } = req.body
        const target = Number(newStock)
        if (!Number.isFinite(target) || target < 0) {
            return res.json({ success: false, message: 'Enter a valid stock value' })
        }
        const product = await productModel.findById(req.params.id)
        if (!product) return res.json({ success: false, message: 'Product not found' })
        const variant = findVariant(product, { sku, size, color })
        if (!variant) return res.json({ success: false, message: 'Variant not found' })

        const before = variant.stock || 0
        variant.stock = target
        await product.save()
        await logAdjustment(product, variant, {
            type: 'correction', qtyChange: target - before, stockBefore: before, stockAfter: target,
            reason: reason || 'Manual stock correction', admin: req.adminEmail || 'admin',
        })
        res.json({ success: true, message: 'Stock adjusted', variant: { sku: variant.sku, stock: variant.stock } })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// GET /api/inventory/history?productId=&sku=&type=&limit=  — stock adjustment log
export const stockHistory = async (req, res) => {
    try {
        const { productId, sku, type, limit = 100 } = req.query
        const q = {}
        if (productId) q.productId = productId
        if (sku) q.sku = sku
        if (type) q.type = type
        const rows = await stockAdjustmentModel.find(q)
            .sort({ createdAt: -1 })
            .limit(Math.min(500, parseInt(limit) || 100))
            .lean()
        res.json({ success: true, rows })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// GET /api/inventory/product/:id — dashboard detail for one product:
// product code + name, stock by size/colour, out-of-stock & total-remaining
// counts, clearance state, and total units sold (from delivered orders).
export const inventoryProductDetail = async (req, res) => {
    try {
        const product = await productModel.findById(req.params.id).lean()
        if (!product) return res.json({ success: false, message: 'Product not found' })

        const threshold = product.lowStockThreshold ?? 5
        const variants = product.variants || []
        let totalStock = 0, outOfStock = 0, lowStock = 0
        variants.forEach((v) => {
            totalStock += v.stock || 0
            if (v.stock <= 0) outOfStock++
            else if (v.stock <= threshold) lowStock++
        })

        // Total units sold across fulfilled (non-cancelled) orders for this product.
        const soldAgg = await orderModel.aggregate([
            { $match: { status: { $nin: ['Cancelled'] } } },
            { $unwind: '$items' },
            { $match: { 'items.productId': product._id } },
            { $group: { _id: null, units: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
        ])
        const totalSalesUnits = soldAgg[0]?.units || 0
        const totalSalesRevenue = soldAgg[0]?.revenue || 0

        const recentHistory = await stockAdjustmentModel.find({ productId: product._id })
            .sort({ createdAt: -1 }).limit(20).lean()

        res.json({
            success: true,
            detail: {
                _id: product._id,
                productCode: product.productCode,
                name: product.name,
                audience: product.audience,
                category: product.category,
                fabric: product.fabric,
                shortDescription: product.shortDescription,
                image: Array.isArray(product.image) ? product.image[0] : product.image,
                price: product.price,
                threshold,
                totalStock,
                outOfStock,
                lowStock,
                variantCount: variants.length,
                onClearance: !!product.onClearance,
                clearanceDiscountPct: product.clearanceDiscountPct || 0,
                totalSalesUnits,
                totalSalesRevenue,
                stockByVariant: variants.map((v) => ({
                    sku: v.sku, size: v.size, color: v.color, colorCode: v.colorCode,
                    stock: v.stock, barcode: v.barcode, humanBarcode: v.humanBarcode,
                    state: v.stock <= 0 ? 'out' : v.stock <= threshold ? 'low' : 'ok',
                })),
                recentHistory,
            },
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// GET /api/inventory/pricetag/:sku  — legal apparel price tag as a printable PDF,
// matching the standard India garment tag (product type, net quantity, size &
// measurements, MRP incl. taxes, country of origin, mfg date, manufacturer &
// customer-care details, EAN-13 barcode, ARTICLE/MOD/COL/CAT/MAT/GEN).
export const renderPriceTag = async (req, res) => {
    try {
        const { sku } = req.params
        const product = await productModel.findOne({ 'variants.sku': sku }).lean()
        if (!product) return res.status(404).json({ success: false, message: 'Product not found for SKU' })
        const v = (product.variants || []).find((x) => x.sku === sku) || {}

        const codeText = v.barcode || v.sku
        const png = await bwipjs.toBuffer({
            bcid: pickBcid(codeText), text: codeText, scale: 3, height: 14,
            includetext: true, textxalign: 'center', textsize: 8,
        })

        const m = product.measurements || {}
        const sizeLines = [
            m.chest ? `Chest: ${m.chest}` : null,
            m.neck ? `Neck: ${m.neck}` : null,
            m.length ? `Length: ${m.length}` : null,
            m.waist ? `Waist: ${m.waist}` : null,
        ].filter(Boolean)
        const mfgDate = product.manufactureDate
            || new Date(product.createdAt || Date.now()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).replace(' ', '-')

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="pricetag-${sku}.pdf"`)

        // Portrait garment tag, ~ 58mm x 92mm.
        const W = 165, H = 300, pad = 10, innerW = W - pad * 2
        const doc = new PDFDocument({ size: [W, H], margin: 0 })
        doc.pipe(res)
        doc.rect(2, 2, W - 4, H - 4).lineWidth(0.8).strokeColor('#222').stroke()

        let y = pad
        const line = (k, val, opt = {}) => {
            doc.font('Helvetica-Bold').fontSize(opt.size || 7).fillColor('#111')
                .text(`${k}`, pad, y, { width: innerW, continued: !!val })
            if (val) doc.font('Helvetica').fillColor('#111').text(` ${val}`)
            y = doc.y + (opt.gap ?? 3)
        }

        line('PRODUCT :', (product.productType || product.category || '').toUpperCase())
        line('NET QUANTITY :', product.netQuantity || '1 N')

        // SIZE block (with measurements if present)
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#111').text('SIZE :', pad, y, { width: innerW, continued: sizeLines.length > 0 })
        if (sizeLines.length) {
            doc.font('Helvetica').text(` ${sizeLines[0]}`)
            for (let i = 1; i < sizeLines.length; i++) {
                doc.font('Helvetica').fontSize(7).fillColor('#111').text(sizeLines[i], pad + 34, doc.y + 1, { width: innerW - 34 })
            }
        } else {
            doc.font('Helvetica').text(` ${v.size || '—'}`)
        }
        y = doc.y + 6

        // MRP
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(`MRP ₹ ${Number(product.price || 0).toFixed(2)}`, pad, y, { width: innerW })
        doc.font('Helvetica').fontSize(6).fillColor('#444').text('incl. of all taxes', pad + 2, doc.y, { width: innerW })
        y = doc.y + 6

        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111')
        line('COUNTRY OF ORIGIN :', (product.countryOfOrigin || company.countryOfOrigin || 'India').toUpperCase(), { size: 6.5, gap: 2 })
        line('DATE OF MFG :', mfgDate, { size: 6.5, gap: 4 })

        // Manufacturer + customer care
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#111').text('NAME & ADDRESS OF MANUFACTURER & CUSTOMER CARE:', pad, y, { width: innerW })
        doc.font('Helvetica').fontSize(6).fillColor('#333')
        const a = company.address
        doc.text(company.legalName, pad, doc.y + 1, { width: innerW })
        doc.text(`${a.line1}${a.line2 ? ', ' + a.line2 : ''}, ${a.city}, ${a.state} - ${a.pincode}`, pad, doc.y + 0.5, { width: innerW })
        if (company.care.tollFree) doc.text(`Toll Free: ${company.care.tollFree}`, pad, doc.y + 0.5, { width: innerW })
        doc.text(`Care: ${company.care.phone}  ${company.care.email}`, pad, doc.y + 0.5, { width: innerW })
        y = doc.y + 5

        // EAN-13 barcode
        try { doc.image(png, pad, y, { width: innerW, height: 34, fit: [innerW, 34], align: 'center' }) } catch { /* ignore */ }
        y += 40

        // Attribute grid: ARTICLE / MOD / COL / CAT / MAT / GEN + size
        const attr = (k, val) => {
            doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111').text(`${k} :`, pad, y, { width: innerW, continued: true })
            doc.font('Helvetica').text(` ${val || '—'}`)
            y = doc.y + 1.5
        }
        attr('ARTICLE NO', product.productCode)
        attr('MOD', (product.productType || product.name || '').toString().toUpperCase().slice(0, 18))
        attr('COL', (v.color || '').toUpperCase())
        attr('CAT', (product.category || '').toUpperCase())
        attr('MAT', (product.fabric || product.material || '').toUpperCase())
        // GEN + size on the same baseline (size aligned right, like the tag)
        const genY = y
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111').text('GEN :', pad, genY, { width: innerW / 2, continued: true })
        doc.font('Helvetica').text(` ${(product.audience || '').toUpperCase()}`)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(String(v.size || '').toUpperCase(), pad, genY - 2, { width: innerW, align: 'right' })

        doc.end()
    } catch (error) {
        console.log(error)
        if (!res.headersSent) res.status(400).json({ success: false, message: error.message })
    }
}
