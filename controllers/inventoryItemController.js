import inventoryItemModel from '../models/inventoryItemModel.js'
import productCodeModel from '../models/productCodeModel.js'

// POST /api/inventory/items/bulk-add  body { items: [{ productCode, size, color, stock, mrp, lowStockThreshold, name }] }
// Adds raw inventory rows (kept separate from customer products).
export const addInventoryItems = async (req, res) => {
    try {
        const items = JSON.parse(req.body.items || '[]')
        if (!Array.isArray(items) || items.length === 0) return res.json({ success: false, message: 'No inventory items provided' })
        if (items.some((it) => !it.productCode)) return res.json({ success: false, message: 'Every item needs a product code' })

        const created = []
        for (let i = 0; i < items.length; i++) {
            const it = items[i]
            const doc = new inventoryItemModel({
                productCode: it.productCode,
                category: it.category, subCategory: it.subCategory, childCategory: it.childCategory, fabric: it.fabric,
                name: it.name, size: it.size || 'Free', color: it.color || 'Default',
                stock: Number(it.stock) || 0, mrp: Number(it.mrp) || 0, lowStockThreshold: Number(it.lowStockThreshold) || 5,
                image: req.files?.[`image_${i}`]?.[0]?.path || undefined,
            })
            await doc.save()
            created.push(doc)
            try { await productCodeModel.updateOne({ code: it.productCode }, { used: true }) } catch { /* ignore */ }
        }
        res.json({ success: true, message: `Added ${created.length} inventory item(s)`, items: created })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}

// GET /api/inventory/items?search=&grouped=true — inventory list BY PRODUCT CODE.
export const listInventory = async (req, res) => {
    try {
        const s = (req.query.search || '').trim()
        const q = s ? { $or: [{ productCode: new RegExp(s, 'i') }, { name: new RegExp(s, 'i') }, { category: new RegExp(s, 'i') }] } : {}
        const rows = await inventoryItemModel.find(q).sort({ productCode: 1, createdAt: 1 }).lean()

        // Group by product code.
        const map = new Map()
        for (const r of rows) {
            if (!map.has(r.productCode)) map.set(r.productCode, {
                productCode: r.productCode, category: r.category, subCategory: r.subCategory, childCategory: r.childCategory,
                fabric: r.fabric, name: r.name, items: [], totalStock: 0,
            })
            const g = map.get(r.productCode)
            g.items.push(r)
            g.totalStock += r.stock || 0
        }
        const groups = [...map.values()]
        const summary = {
            codes: groups.length,
            items: rows.length,
            totalStock: rows.reduce((s, r) => s + (r.stock || 0), 0),
            lowStock: rows.filter((r) => r.stock > 0 && r.stock <= (r.lowStockThreshold ?? 5)).length,
            outOfStock: rows.filter((r) => (r.stock || 0) <= 0).length,
            value: rows.reduce((s, r) => s + (r.stock || 0) * (r.mrp || 0), 0),
        }
        res.json({ success: true, groups, rows, summary })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}

// PUT /api/inventory/items/:id — edit an inventory item.
export const updateInventoryItem = async (req, res) => {
    try {
        const { size, color, stock, mrp, lowStockThreshold, name } = req.body
        const patch = {}
        if (size !== undefined) patch.size = size
        if (color !== undefined) patch.color = color
        if (stock !== undefined) patch.stock = Number(stock)
        if (mrp !== undefined) patch.mrp = Number(mrp)
        if (lowStockThreshold !== undefined) patch.lowStockThreshold = Number(lowStockThreshold)
        if (name !== undefined) patch.name = name
        const doc = await inventoryItemModel.findByIdAndUpdate(req.params.id, patch, { new: true })
        if (!doc) return res.json({ success: false, message: 'Inventory item not found' })
        res.json({ success: true, message: 'Inventory updated', item: doc })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}

// DELETE /api/inventory/items/:id
export const deleteInventoryItem = async (req, res) => {
    try {
        const doc = await inventoryItemModel.findByIdAndDelete(req.params.id)
        if (!doc) return res.json({ success: false, message: 'Not found' })
        // If no inventory remains for this code, flag the code as unused again.
        const remaining = await inventoryItemModel.countDocuments({ productCode: doc.productCode })
        if (remaining === 0) { try { await productCodeModel.updateOne({ code: doc.productCode }, { used: false }) } catch { /* ignore */ } }
        res.json({ success: true, message: 'Inventory item deleted' })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}

// POST /api/inventory/items/adjust/:id  body { type: 'Increase'|'Decrease', qty, reason }
// Stock update targets a specific inventory item (which belongs to a product code).
export const adjustInventoryStock = async (req, res) => {
    try {
        const { type = 'Increase', qty, reason } = req.body
        const item = await inventoryItemModel.findById(req.params.id)
        if (!item) return res.json({ success: false, message: 'Inventory item not found' })
        const delta = (type === 'Decrease' ? -1 : 1) * Math.abs(Number(qty) || 0)
        const before = item.stock || 0
        item.stock = Math.max(0, before + delta)
        await item.save()
        res.json({ success: true, message: `Stock ${type === 'Decrease' ? 'decreased' : 'increased'} for ${item.productCode} (${item.size}/${item.color})`, item, before, after: item.stock })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}

// GET /api/inventory/codes-with-stock — product codes that HAVE inventory,
// so the Products page can only build products from stocked codes.
export const codesWithInventory = async (req, res) => {
    try {
        const codes = await inventoryItemModel.aggregate([
            { $group: { _id: '$productCode', totalStock: { $sum: '$stock' }, items: { $sum: 1 },
                category: { $first: '$category' }, subCategory: { $first: '$subCategory' }, childCategory: { $first: '$childCategory' }, fabric: { $first: '$fabric' } } },
            { $sort: { _id: 1 } },
        ])
        const rows = codes.map((c) => ({ productCode: c._id, totalStock: c.totalStock, items: c.items, category: c.category, subCategory: c.subCategory, childCategory: c.childCategory, fabric: c.fabric }))
        res.json({ success: true, codes: rows })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}

// GET /api/inventory/items/by-code/:code — all inventory variants for one code
// (used to auto-fill a product's variants from its inventory).
export const inventoryByCode = async (req, res) => {
    try {
        const items = await inventoryItemModel.find({ productCode: req.params.code }).lean()
        res.json({ success: true, items })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}
