// Clean the orders table: delete every order and reset the per-year order-number
// counters so the next order starts fresh. Does NOT touch shipments/returns.
// Runs against whatever MONGODB_URI points at (the new Locoxo cluster).
//
//   node scripts/clean-orders.js            # asks for nothing, wipes orders
//   node scripts/clean-orders.js --dry-run  # just report counts, change nothing
import 'dotenv/config'
import mongoose from 'mongoose'

const DRY = process.argv.includes('--dry-run')

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'locoxo', serverSelectionTimeoutMS: 15000 })
    const db = mongoose.connection.db
    console.log(`Database: ${db.databaseName}`)

    const orders = await db.collection('orders').countDocuments()
    const counters = await db.collection('counters').find({ _id: { $regex: '^orderNumber:' } }).toArray()
    console.log(`  orders: ${orders}`)
    console.log(`  order counters: ${counters.map((c) => `${c._id}=${c.seq}`).join(', ') || '(none)'}`)

    if (DRY) { console.log('\n--dry-run: no changes made.'); await mongoose.disconnect(); return }

    const del = await db.collection('orders').deleteMany({})
    const cnt = await db.collection('counters').deleteMany({ _id: { $regex: '^orderNumber:' } })
    console.log(`\n  deleted ${del.deletedCount} orders`)
    console.log(`  reset ${cnt.deletedCount} order counters`)

    await mongoose.disconnect()
    console.log('Done — orders table is clean.')
}

run().catch((e) => { console.error(e); process.exit(1) })
