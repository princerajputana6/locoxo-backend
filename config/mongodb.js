import mongoose from "mongoose";

const connectDB = async () => {

    mongoose.connection.on('connected',() => {
        console.log("DB Connected");
    })

    // Use the URI as-is and select the DB via the dbName option. Concatenating
    // the DB name onto the URI breaks when the URI carries a query string
    // (e.g. "…?w=majority" would become "…w=majoritylocoxo").
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'locoxo' })

}

export default connectDB;