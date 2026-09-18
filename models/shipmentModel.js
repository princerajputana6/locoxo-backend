import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
    status: { type: String, required: true },
    description: { type: String },
    location: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { _id: true })

const shipmentSchema = new mongoose.Schema({
    // Not unique: an order can have a forward shipment AND a later return shipment.
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'order', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },

    provider: { type: String, default: 'mock' },        // velocity | mock
    awb: { type: String, index: true },                  // air waybill / tracking id
    trackingUrl: { type: String },                       // our own /track page
    carrierTrackUrl: { type: String },                   // carrier's public track page

    status: {
        type: String,
        enum: ['created', 'label_generated', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'],
        default: 'created'
    },
    currentLocation: { type: String },
    expectedDelivery: { type: Date },
    deliveredAt: { type: Date },

    // Carrier / allocation details returned by the provider.
    courierName: { type: String },                       // e.g. "Delhivery Standard"
    courierCompanyId: { type: String },                  // carrier_id
    labelUrl: { type: String },                          // shipping label PDF (S3 signed)
    manifestUrl: { type: String },
    providerShipmentId: { type: String },                // Velocity shipment_id (SHI…)
    providerOrderId: { type: String },                   // Velocity order_id (ORD…)
    appliedWeight: { type: Number },
    cod: { type: Boolean, default: false },
    charges: { type: Object },                           // { frwd_charges, rto_charges, … }

    isReturn: { type: Boolean, default: false },
    lastSyncedAt: { type: Date },                        // last tracking pull

    events: { type: [eventSchema], default: [] },

    providerPayload: { type: Object } // raw provider response, useful for debugging
}, { timestamps: true })

const shipmentModel = mongoose.models.shipment || mongoose.model('shipment', shipmentSchema);

export default shipmentModel
