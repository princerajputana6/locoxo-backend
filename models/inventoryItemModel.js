import mongoose from 'mongoose'
import { nextSeq } from './counterModel.js'
import { ean13FromSerial, humanBarcode } from '../utils/barcode.js'

// Inventory is kept SEPARATE from customer-facing products. An inventory item is
// raw stock keyed by PRODUCT CODE (one row per code + size + colour). Products in
// the Products page are created later from a product code that HAS inventory.
const inventoryItemSchema = new mongoose.Schema({
    productCode: { type: String, required: true, index: true },   // LX2026NN — the registry code
    category: { type: String },
    subCategory: { type: String },
    childCategory: { type: String },
    fabric: { type: String },
    name: { type: String },                                       // optional descriptive name

    size: { type: String, default: 'Free' },
    color: { type: String, default: 'Default' },
    stock: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },

    sku: { type: String, index: true },
    barcode: { type: String },        // Indian EAN-13
    humanBarcode: { type: String },
    image: { type: String },
}, { timestamps: true })

const slug = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'INV'

// Auto-assign SKU + EAN-13 barcode on creation (same scheme as products).
inventoryItemSchema.pre('save', async function (next) {
    try {
        if (!this.sku) this.sku = `${slug(this.productCode)}-${slug(this.size)}-${slug(this.color)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
        if (!this.barcode) this.barcode = ean13FromSerial(await nextSeq('ean'))
        if (!this.humanBarcode) this.humanBarcode = humanBarcode({ productCode: this.productCode, category: this.category, name: this.name || this.productCode, size: this.size, color: this.color, stock: this.stock })
        next()
    } catch (e) { next(e) }
})

const inventoryItemModel = mongoose.models.inventoryItem || mongoose.model('inventoryItem', inventoryItemSchema)
export default inventoryItemModel
