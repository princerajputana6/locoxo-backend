/**
 * One-off migration: copy every collection (docs + indexes) from an OLD MongoDB
 * cluster to a NEW one, then (by default) empty the `orders` collection and reset
 * the order-number counter in the NEW cluster.
 *
 * Non-destructive to the OLD cluster (reads only).
 *
 * Usage:
 *   OLD_MONGODB_URI="mongodb+srv://…" NEW_MONGODB_URI="mongodb+srv://…" \
 *     node scripts/migrate-to-new-db.js [--force] [--keep-orders]
 *
 *   --force        overwrite collections that already have docs in NEW
 *   --keep-orders  copy orders as-is and skip the orders wipe / counter reset
 *
 * DB name is 'locoxo' on both (matches config/mongodb.js).
 */
import mongoose from 'mongoose'

const OLD = process.env.OLD_MONGODB_URI
const NEW = process.env.NEW_MONGODB_URI
const FORCE = process.argv.includes('--force')
const KEEP_ORDERS = process.argv.includes('--keep-orders')
const DB_NAME = 'locoxo'
const BATCH = 500

if (!OLD || !NEW) {
    console.error('Set OLD_MONGODB_URI and NEW_MONGODB_URI env vars.')
    process.exit(1)
}

const connect = (uri) => mongoose.createConnection(uri, { dbName: DB_NAME, serverSelectionTimeoutMS: 30000 }).asPromise()

const copyIndexes = async (srcCol, dstCol, name) => {
    let idx = []
    try { idx = await srcCol.indexes() } catch { return 0 }
    let made = 0
    for (const ix of idx) {
        if (ix.name === '_id_') continue // implicit
        const { key, name: ixName, v, ns, background, ...opts } = ix
        try { await dstCol.createIndex(key, { name: ixName, ...opts }); made++ }
        catch (e) { console.log(`   index ${name}.${ixName} skipped: ${e.message}`) }
    }
    return made
}

const run = async () => {
    console.log('Connecting…')
    const [oldC, newC] = await Promise.all([connect(OLD), connect(NEW)])
    console.log('Connected to OLD and NEW.\n')

    const cols = (await oldC.db.listCollections().toArray())
        .map((c) => c.name)
        .filter((n) => !n.startsWith('system.'))
        .sort()

    const rows = []
    for (const name of cols) {
        const src = oldC.db.collection(name)
        const dst = newC.db.collection(name)
        const oldCount = await src.countDocuments()
        const existing = await dst.countDocuments()

        if (existing > 0 && !FORCE) {
            console.log(`• ${name}: NEW already has ${existing} docs — skipped (use --force to overwrite)`)
            rows.push({ name, oldCount, newCount: existing, note: 'skipped' })
            continue
        }
        if (existing > 0 && FORCE) { await dst.deleteMany({}); }

        // Copy docs in batches.
        let copied = 0
        const cursor = src.find({}, { noCursorTimeout: false })
        let buf = []
        for await (const doc of cursor) {
            buf.push(doc)
            if (buf.length >= BATCH) { if (buf.length) await dst.insertMany(buf, { ordered: false }); copied += buf.length; buf = [] }
        }
        if (buf.length) { await dst.insertMany(buf, { ordered: false }); copied += buf.length }

        const madeIdx = await copyIndexes(src, dst, name)
        const newCount = await dst.countDocuments()
        console.log(`✓ ${name}: copied ${copied}/${oldCount} docs, ${madeIdx} index(es)`)
        rows.push({ name, oldCount, newCount, note: '' })
    }

    // Orders cleanup on NEW (default).
    if (!KEEP_ORDERS) {
        const delOrders = await newC.db.collection('orders').deleteMany({})
        // Reset order-number counters (orderNumber:<year>) so numbering restarts clean.
        const counters = await newC.db.collection('counters')
        const resetRes = await counters.deleteMany({ _id: { $regex: /^orderNumber:/ } }).catch(() => ({ deletedCount: 0 }))
        console.log(`\n🧹 Cleaned NEW orders: removed ${delOrders.deletedCount}; reset ${resetRes.deletedCount} order counter(s).`)
    }

    // Summary table.
    console.log('\n─────────────── SUMMARY (OLD → NEW) ───────────────')
    for (const r of rows) {
        const newNow = await newC.db.collection(r.name).countDocuments()
        const flag = r.name === 'orders' && !KEEP_ORDERS ? '(orders wiped)' : (newNow === r.oldCount ? 'OK' : '⚠ MISMATCH')
        console.log(`  ${r.name.padEnd(22)} ${String(r.oldCount).padStart(5)} → ${String(newNow).padStart(5)}  ${flag}`)
    }

    await Promise.all([oldC.close(), newC.close()])
    console.log('\nDone.')
    process.exit(0)
}

run().catch((e) => { console.error('Migration failed:', e); process.exit(1) })
