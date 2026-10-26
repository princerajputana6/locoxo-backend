// One-off migration: copy every collection from the OLD shared cluster to the
// dedicated Locoxo cluster, preserving documents AND indexes, then clean the
// `orders` collection on the new cluster (and reset its sequence counter).
//
// Safe to re-run: by default a collection that already has documents on NEW is
// left untouched. Pass --force to drop+recopy such collections.
//
//   node scripts/migrate-to-new-db.js
//   node scripts/migrate-to-new-db.js --force
//
// Credentials are read from env only — never hardcode connection strings here
// (they end up in git history). Provide them inline for a one-off run, e.g.:
//   OLD_MONGODB_URI="mongodb+srv://USER:PASS@old.../" \
//   NEW_MONGODB_URI="mongodb+srv://USER:PASS@new.../" \
//   node scripts/migrate-to-new-db.js
import 'dotenv/config'
import mongoose from 'mongoose'

const OLD_URI = process.env.OLD_MONGODB_URI
const NEW_URI = process.env.NEW_MONGODB_URI
if (!OLD_URI || !NEW_URI) {
    console.error('Set OLD_MONGODB_URI and NEW_MONGODB_URI (do not hardcode credentials).')
    process.exit(1)
}
const DB_NAME = 'locoxo'
const BATCH = 500
const FORCE = process.argv.includes('--force')

const connect = (uri) =>
    mongoose.createConnection(uri, { dbName: DB_NAME, serverSelectionTimeoutMS: 15000 }).asPromise()

const count = async (db, name) => {
    try { return await db.collection(name).countDocuments() } catch { return 0 }
}

const copyCollection = async (oldDb, newDb, name) => {
    const src = oldDb.collection(name)
    const dst = newDb.collection(name)

    const existing = await count(newDb, name)
    if (existing > 0) {
        if (!FORCE) { console.log(`  skip ${name.padEnd(22)} (NEW already has ${existing} docs)`); return existing }
        await dst.drop().catch(() => {})
        console.log(`  --force: dropped ${name} on NEW`)
    }

    // Copy documents in batches, keeping original _id values.
    const cursor = src.find({})
    let buffer = []
    let inserted = 0
    for await (const doc of cursor) {
        buffer.push(doc)
        if (buffer.length >= BATCH) {
            if (buffer.length) await dst.insertMany(buffer, { ordered: false }).catch((e) => console.log(`   insert warn (${name}): ${e.message}`))
            inserted += buffer.length
            buffer = []
        }
    }
    if (buffer.length) {
        await dst.insertMany(buffer, { ordered: false }).catch((e) => console.log(`   insert warn (${name}): ${e.message}`))
        inserted += buffer.length
    }

    // Recreate indexes (skip the default _id index Mongo makes automatically).
    try {
        const indexes = await src.indexes()
        const toCreate = indexes
            .filter((ix) => ix.name !== '_id_')
            .map((ix) => {
                const { key, name: ixName, v, ns, background, ...opts } = ix
                return { key, name: ixName, ...opts }
            })
        if (toCreate.length) await dst.createIndexes(toCreate).catch((e) => console.log(`   index warn (${name}): ${e.message}`))
    } catch (e) {
        console.log(`   index read warn (${name}): ${e.message}`)
    }

    console.log(`  copied ${name.padEnd(22)} ${inserted} docs`)
    return inserted
}

const run = async () => {
    console.log('Connecting…')
    const oldConn = await connect(OLD_URI)
    const newConn = await connect(NEW_URI)
    const oldDb = oldConn.db
    const newDb = newConn.db
    console.log(`  OLD: ${oldDb.databaseName} @ ${OLD_URI.split('@')[1]?.split('/')[0]}`)
    console.log(`  NEW: ${newDb.databaseName} @ ${NEW_URI.split('@')[1]?.split('/')[0]}\n`)

    const collections = (await oldDb.listCollections().toArray())
        .map((c) => c.name)
        .filter((n) => !n.startsWith('system.'))
        .sort()

    console.log(`Copying ${collections.length} collections${FORCE ? ' (--force)' : ''}:`)
    for (const name of collections) await copyCollection(oldDb, newDb, name)

    // Clean orders on NEW and reset its sequence counter so new order numbers
    // start from a clean slate.
    console.log('\nCleaning orders on NEW…')
    const del = await newDb.collection('orders').deleteMany({})
    console.log(`  cleared orders (${del.deletedCount})`)
    // Order numbers use per-year counters keyed `orderNumber:<year>` (see
    // utils/orderNumber.js). Reset only those — leave productCode/ean counters
    // intact so future product codes don't collide with migrated ones.
    const counterRes = await newDb.collection('counters').deleteMany(
        { _id: { $regex: '^orderNumber:' } },
    ).catch(() => ({ deletedCount: 0 }))
    const removedCounters = counterRes.deletedCount ?? 0
    console.log(`  reset order counters (removed ${removedCounters})`)

    // Verification table.
    console.log('\nVerification (OLD → NEW):')
    let mismatch = false
    for (const name of collections) {
        const o = await count(oldDb, name)
        const n = await count(newDb, name)
        let expected = o
        if (name === 'orders') expected = 0
        if (name === 'counters') expected = o - removedCounters
        const ok = n === expected ? 'ok' : 'MISMATCH'
        if (n !== expected) mismatch = true
        console.log(`  ${name.padEnd(22)} ${String(o).padStart(5)} → ${String(n).padStart(5)}  ${ok}`)
    }

    await oldConn.close()
    await newConn.close()
    console.log(mismatch
        ? '\nDone WITH MISMATCHES — review the rows marked MISMATCH above.'
        : '\nDone — all collections match (orders intentionally 0 on NEW).')
}

run().catch((e) => { console.error(e); process.exit(1) })
