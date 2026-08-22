// One-off: wipe ALL data from the locoxo database so the admin can start fresh.
// Clears every collection's documents (keeps indexes) and resets the sequence
// counters. Admin login is env-based (ADMIN_EMAIL/PASSWORD), so this does NOT
// lock anyone out. Run:  node scripts/wipe-db.js
import 'dotenv/config'
import mongoose from 'mongoose'

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'locoxo' })
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()

    console.log(`\nDatabase: ${db.databaseName}`)
    console.log('Before wipe:')
    let total = 0
    for (const c of collections) {
        const n = await db.collection(c.name).countDocuments()
        total += n
        if (n) console.log(`  ${c.name.padEnd(22)} ${n}`)
    }
    console.log(`  TOTAL documents: ${total}\n`)

    for (const c of collections) {
        const { deletedCount } = await db.collection(c.name).deleteMany({})
        if (deletedCount) console.log(`  cleared ${c.name} (${deletedCount})`)
    }

    console.log('\nAfter wipe:')
    let after = 0
    for (const c of collections) after += await db.collection(c.name).countDocuments()
    console.log(`  TOTAL documents: ${after}`)

    await mongoose.disconnect()
    console.log('\nDone — database is empty. Start adding data from the admin panel.')
}

run().catch((e) => { console.error(e); process.exit(1) })
