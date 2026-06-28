import bwipjs from 'bwip-js'
import PDFDocument from 'pdfkit'
import productModel from '../models/productModel.js'

const PLACEHOLDER_IMG = 'https://placehold.co/600x800/0E4F86/FFFFFF?text=LOCOXO'

// POST /api/inventory/bulk-add   body: { products: [...] }
// Creates multiple products at once. SKU + barcode are auto-generated per
// variant by the productModel pre-save hook.
export const bulkAddProducts = async (req, res) => {
    try {
        const { products } = req.body
        if (!Array.isArray(products) || products.length === 0) {
            return res.json({ success: false, message: 'No products provided' })
        }

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

                const doc = new productModel({
                    name: p.name,
                    description: p.description || p.name,
                    price: Number(p.price),
                    discountPrice: p.discountPrice ? Number(p.discountPrice) : undefined,
                    category: p.category || 'Uncategorized',
                    subCategory: p.subCategory || 'General',
                    sizes,
                    variants,
                    brand: p.brand || 'LOCOXO',
                    image: Array.isArray(p.image) && p.image.length ? p.image : [PLACEHOLDER_IMG],
                    status: p.status || 'active',
                    lowStockThreshold: p.lowStockThreshold ?? 5,
                    date: Date.now(),
                })
                await doc.save() // pre-save assigns SKU + barcode per variant
                created.push({ id: doc._id, name: doc.name, variants: doc.variants.length })
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
                    })
                    added++
                })

            // Fallback: a product with no SKU'd variants still gets one product-level
            // barcode (so any selected product can be downloaded). Skipped for the
            // stock-specific filters, which are inherently variant-level.
            if (added === 0 && filter !== 'low' && filter !== 'out') {
                const totalStock = (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0)
                cards.push({
                    name: p.name, price: p.price, category: p.category,
                    size: '—', color: '—', sku: productCode(p), stock: totalStock,
                })
            }
        })

        if (cards.length === 0) {
            // 200 + JSON so the client can show a friendly message (blob content-type check)
            return res.json({ success: false, message: 'No barcodes match the selected filters' })
        }

        // Pre-render barcode PNGs
        const withImages = await Promise.all(cards.map(async (c) => {
            const png = await bwipjs.toBuffer({
                bcid: 'code128', text: c.sku, scale: 3, height: 12,
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
            bcid: 'code128',
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
        let { name = '', price = '', size = '', color = '', stock = '' } = req.query

        // Fallback: look the variant up by SKU if details weren't supplied.
        if (!name) {
            const p = await productModel.findOne({ 'variants.sku': sku }).lean()
            if (p) {
                name = p.name; price = price || p.price
                const v = (p.variants || []).find(v => v.sku === sku)
                if (v) { size = size || v.size; color = color || v.color; stock = stock === '' ? v.stock : stock }
            }
        }

        const png = await bwipjs.toBuffer({
            bcid: 'code128', text: sku, scale: 3, height: 12,
            includetext: true, textxalign: 'center', textsize: 9,
        })
        const b64 = png.toString('base64')

        const W = 280, pad = 12
        const hasVariant = size && size !== '—'
        const barY = hasVariant ? 64 : 50
        const H = barY + 66
        const imgW = W - pad * 2

        const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="#ffffff" stroke="#e2e6ec"/>
  <text x="${pad}" y="22" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" fill="#062B52">${xmlEsc(String(name).slice(0, 30))}</text>
  ${hasVariant ? `<text x="${pad}" y="40" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#5b6b80">${xmlEsc(size)}${color ? ' · ' + xmlEsc(color) : ''}</text>` : ''}
  <text x="${pad}" y="${hasVariant ? 58 : 42}" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" fill="#0E4F86">Rs.${xmlEsc(price)}</text>
  <image x="${pad}" y="${barY}" width="${imgW}" height="46" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${b64}"/>
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
