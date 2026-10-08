/**
 * Empty the `orders` collection and reset the order-number counter on the DB in
 * MONGODB_URI (dbName 'locoxo'). Shipments and returns are left untouched.
 *
 * Usage:  MONGODB_URI="mongodb+srv://…" node scripts/clean-orders.js
 */
import mongoose from 'mongoose'

const URI = process.env.MONGODB_URI
if (!URI) { console.error('Set MONGODB_URI.'); process.exit(1) }

const run = async () => {
    const c = await mongoose.createConnection(URI, { dbName: 'locoxo', serverSelectionTimeoutMS: 30000 }).asPromise()
    const orders = await c.db.collection('orders').deleteMany({})
    const counters = await c.db.collection('counters').deleteMany({ _id: { $regex: /^orderNumber:/ } }).catch(() => ({ deletedCount: 0 }))
    console.log(`Removed ${orders.deletedCount} orders; reset ${counters.deletedCount} order counter(s).`)
    await c.close()
    process.exit(0)
}
run().catch((e) => { console.error(e); process.exit(1) })
