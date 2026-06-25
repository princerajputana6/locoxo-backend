import express from 'express'
import {
    renderBarcode,
    inventorySummary,
    listLowStock,
    updateClearance,
    updateThreshold,
    backfillSkus,
    bulkAddProducts,
    barcodeSheetPdf
} from '../controllers/inventoryController.js'
import adminAuth from '../middleware/adminAuth.js'

const inventoryRouter = express.Router()

// Barcode image is public so it can be loaded in <img src> from admin without token plumbing
inventoryRouter.get('/barcode/:sku', renderBarcode)

// Bulk add products (SKU + barcode auto-generated per variant) + barcode PDF export
inventoryRouter.post('/bulk-add', adminAuth, bulkAddProducts)
inventoryRouter.get('/barcodes/pdf', adminAuth, barcodeSheetPdf)

inventoryRouter.get('/summary', adminAuth, inventorySummary)
inventoryRouter.get('/low-stock', adminAuth, listLowStock)
inventoryRouter.put('/clearance/:id', adminAuth, updateClearance)
inventoryRouter.put('/threshold/:id', adminAuth, updateThreshold)
inventoryRouter.post('/backfill-skus', adminAuth, backfillSkus)

export default inventoryRouter
