import express from 'express'
import {
    renderBarcode,
    inventorySummary,
    listLowStock,
    updateClearance,
    updateThreshold,
    backfillSkus,
    bulkAddProducts,
    barcodeSheetPdf,
    renderBarcodeLabel,
    renderBarcodeLabelPdf
} from '../controllers/inventoryController.js'
import adminAuth from '../middleware/adminAuth.js'
import upload from '../middleware/multer.js'

const inventoryRouter = express.Router()

// Barcode images are public so they can be loaded in <img src> from admin without token plumbing
inventoryRouter.get('/barcode/:sku', renderBarcode)
// Labeled barcode (barcode + product details baked into one SVG image)
inventoryRouter.get('/label/:sku', renderBarcodeLabel)
// Same label as a printable PDF (most portable format for download/print)
inventoryRouter.get('/label-pdf/:sku', renderBarcodeLabelPdf)

// Bulk add products (SKU + barcode auto-generated per variant) + barcode PDF export
// upload.any() accepts optional per-row image files (image_0, image_1, …).
// Works fine with a plain JSON body too (no files → req.files is empty).
inventoryRouter.post('/bulk-add', adminAuth, upload.any(), bulkAddProducts)
inventoryRouter.get('/barcodes/pdf', adminAuth, barcodeSheetPdf)

inventoryRouter.get('/summary', adminAuth, inventorySummary)
inventoryRouter.get('/low-stock', adminAuth, listLowStock)
inventoryRouter.put('/clearance/:id', adminAuth, updateClearance)
inventoryRouter.put('/threshold/:id', adminAuth, updateThreshold)
inventoryRouter.post('/backfill-skus', adminAuth, backfillSkus)

export default inventoryRouter
