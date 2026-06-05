import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
    status: { type: String, required: true },
    description: { type: String },
    location: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { _id: true })

const shipmentSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'order', required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },

    provider: { type: String, default: 'mock' },        // shiprocket | delhivery | dhl | mock
    awb: { type: String, index: true },                  // air waybill / tracking id
    trackingUrl: { type: String },

    status: {
        type: String,
        enum: ['created', 'label_generated', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'],
        default: 'created'
    },
    currentLocation: { type: String },
    expectedDelivery: { type: Date },

    events: { type: [eventSchema], default: [] },

    providerPayload: { type: Object } // raw provider response, useful for debugging
}, { timestamps: true })

const shipmentModel = mongoose.models.shipment || mongoose.model('shipment', shipmentSchema);

export default shipmentModel
