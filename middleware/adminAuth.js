import jwt from 'jsonwebtoken'
import staffModel from '../models/staffModel.js'

const adminAuth = async (req,res,next) => {
    try {
        const { token } = req.headers
        if (!token) {
            return res.json({success:false,message:"Not Authorized Login Again"})
        }
        const token_decode = jwt.verify(token,process.env.JWT_SECRET);

        // 1) The super-admin env token (string payload = email+password).
        if (typeof token_decode === 'string' && token_decode === process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD) {
            req.adminEmail = process.env.ADMIN_EMAIL
            req.adminRole = 'admin'
            req.permissions = 'all'
            return next()
        }

        // 2) A staff / sub-admin token (object payload with kind:'staff').
        if (token_decode && typeof token_decode === 'object' && token_decode.kind === 'staff') {
            const staff = await staffModel.findById(token_decode.id).lean()
            if (!staff || staff.status !== 'active') {
                return res.json({ success: false, message: 'Not Authorized Login Again' })
            }
            req.staff = staff
            req.adminEmail = staff.email
            req.adminRole = staff.role
            req.permissions = staff.accessType === 'all' ? 'all' : (staff.permissions || [])
            return next()
        }

        return res.json({success:false,message:"Not Authorized Login Again"})
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export default adminAuth