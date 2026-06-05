import bwipjs from 'bwip-js'
import productModel from '../models/productModel.js'

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
