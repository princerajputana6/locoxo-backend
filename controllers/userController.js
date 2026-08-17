import validator from "validator";
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import returnModel from "../models/returnModel.js";
import { customerIdFor } from "../utils/orderNumber.js";
import { sendOtp, checkOtp, normalisePhone } from "../services/twilioService.js";
import { sendPasswordResetEmail, isConfigured as isEmailConfigured } from "../services/emailService.js";
import { generateReferralCode, ensureReferralCode } from "../utils/referral.js";

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');


const createToken = (id) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('JWT_SECRET is not defined in environment variables!');
        console.error('Current env keys:', Object.keys(process.env).filter(k => k.includes('JWT') || k.includes('SECRET')));
        throw new Error('JWT_SECRET environment variable is not set');
    }
    return jwt.sign({ id }, secret)
}

// Route for user login
const loginUser = async (req, res) => {
    try {

        const { email, password } = req.body;

        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: "User doesn't exists" })
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {

            const token = createToken(user._id)
            res.json({ success: true, token })

        }
        else {
            res.json({ success: false, message: 'Invalid credentials' })
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for user register
const registerUser = async (req, res) => {
    try {

        const { name, email, password, phone, dob, referralCode } = req.body;

        // checking user already exists or not
        const exists = await userModel.findOne({ email });
        if (exists) {
            return res.json({ success: false, message: "User already exists" })
        }

        // validating email format & strong password
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }
        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" })
        }

        // hashing user password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        // Resolve referrer (if a valid referral code was supplied)
        let referredBy;
        if (referralCode) {
            const referrer = await userModel.findOne({ referralCode });
            if (referrer) referredBy = referrer._id;
        }

        const newUser = new userModel({
            name,
            email,
            password: hashedPassword,
            phone: phone || undefined,
            dob: dob || undefined,
            referralCode: await generateReferralCode(name),
            referredBy
        })

        const user = await newUser.save()

        const token = createToken(user._id)

        res.json({ success: true, token })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for admin login
const adminLogin = async (req, res) => {
    try {
        
        const {email,password} = req.body

        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            const token = jwt.sign(email+password,process.env.JWT_SECRET);
            res.json({success:true,token})
        } else {
            res.json({success:false,message:"Invalid credentials"})
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}


// Route to get all customers (admin only)
const getAllCustomers = async (req, res) => {
    try {
        const customers = await userModel.find({}).select('-password').sort({ createdAt: -1 });
        res.json({ success: true, customers });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Route to get user profile
const getUserProfile = async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await userModel.findById(userId).select('-password');
        
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, user });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Route for Google sign-in
const googleAuth = async (req, res) => {
    try {
        const { email, name, googleId, photoURL } = req.body;

        if (!email || !googleId) {
            return res.json({ success: false, message: 'Missing Google account details' });
        }

        let user = await userModel.findOne({ email });

        if (!user) {
            user = new userModel({
                name: name || email.split('@')[0],
                email,
                googleId,
                photoURL,
                password: 'google-oauth-' + googleId
            });
            await user.save();
        } else if (!user.googleId) {
            user.googleId = googleId;
            if (photoURL) user.photoURL = photoURL;
            await user.save();
        }

        const token = createToken(user._id);
        res.json({ success: true, token });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Add an address to the user
const addAddress = async (req, res) => {
    try {
        const {
            userId, type, name, phone,
            street, addressLine2, landmark,
            city, state, zipCode, country,
            lat, lng, isDefault
        } = req.body;

        const user = await userModel.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        if (isDefault || user.addresses.length === 0) {
            user.addresses.forEach(a => { a.isDefault = false; });
        }

        user.addresses.push({
            type: type || 'home',
            name, phone, street, addressLine2, landmark,
            city, state, zipCode, country: country || 'India',
            lat, lng,
            isDefault: isDefault || user.addresses.length === 0
        });
        await user.save();

        res.json({ success: true, message: 'Address added', addresses: user.addresses });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Delete an address
const deleteAddress = async (req, res) => {
    try {
        const { userId } = req.body;
        const { id } = req.params;

        const user = await userModel.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        user.addresses = user.addresses.filter(a => a._id.toString() !== id);
        await user.save();

        res.json({ success: true, message: 'Address deleted', addresses: user.addresses });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// ---- OTP login via Twilio Verify ----

// Step 1: send an OTP to the phone number
const sendLoginOtp = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.json({ success: false, message: 'Phone number is required' });

        const result = await sendOtp(phone);
        res.json({
            success: true,
            message: 'OTP sent',
            phone: result.to,
            dev: result.dev || false // true when Twilio isn't configured (test OTP 123456)
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Step 2: verify the OTP, then log in (creating the account if new)
const verifyLoginOtp = async (req, res) => {
    try {
        const { phone, code, name, referralCode } = req.body;
        if (!phone || !code) return res.json({ success: false, message: 'Phone and OTP are required' });

        const check = await checkOtp(phone, code);
        if (!check.approved) return res.json({ success: false, message: 'Invalid or expired OTP' });

        const e164 = normalisePhone(phone);
        let user = await userModel.findOne({ phone: e164 });

        if (!user) {
            // Resolve referrer if a code was supplied
            let referredBy;
            if (referralCode) {
                const referrer = await userModel.findOne({ referralCode });
                if (referrer) referredBy = referrer._id;
            }
            user = new userModel({
                name: name || `User ${e164.slice(-4)}`,
                email: `${e164.replace('+', '')}@otp.locoxo.in`,
                phone: e164,
                phoneVerified: true,
                referralCode: await generateReferralCode(name),
                referredBy
            });
            await user.save();
        } else if (!user.phoneVerified) {
            user.phoneVerified = true;
            await ensureReferralCode(user);
            await user.save();
        }

        const token = createToken(user._id);
        res.json({ success: true, token });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Route to update user profile
const updateUserProfile = async (req, res) => {
    try {
        const { userId } = req.body;
        const { name, phone, address } = req.body;
        
        const updateData = {};
        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        if (address) updateData.address = address;
        
        const user = await userModel.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        ).select('-password');
        
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, message: 'Profile updated successfully', user });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// ---- Password reset via email ----

// Step 1: request a reset link
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !validator.isEmail(email)) {
            return res.json({ success: false, message: 'Please enter a valid email' });
        }

        const user = await userModel.findOne({ email });

        // Always respond the same way so we don't reveal which emails exist.
        const genericMsg = 'If an account exists for that email, a reset link has been sent.';

        if (!user) {
            return res.json({ success: true, message: genericMsg });
        }

        // Generate a raw token (sent in the link) and store only its hash.
        const rawToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = hashToken(rawToken);
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

        const result = await sendPasswordResetEmail(user.email, user.name, resetLink);

        // In dev (no SMTP configured) return the link so the flow is testable.
        res.json({
            success: true,
            message: genericMsg,
            ...(result.dev ? { devLink: resetLink } : {}),
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Step 2: verify token + set a new password
const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token) return res.json({ success: false, message: 'Invalid reset link' });
        if (!password || password.length < 8) {
            return res.json({ success: false, message: 'Password must be at least 8 characters' });
        }

        const user = await userModel.findOne({
            resetPasswordToken: hashToken(token),
            resetPasswordExpires: { $gt: new Date() },
        });

        if (!user) {
            return res.json({ success: false, message: 'Reset link is invalid or has expired' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        // Log the user straight in
        const authToken = createToken(user._id);
        res.json({ success: true, message: 'Password updated', token: authToken });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/user/customer/:id — full customer detail for the admin drawer:
// profile + computed customer id + order/return history + wishlist + spend totals.
const getCustomerDetail = async (req, res) => {
    try {
        const user = await userModel.findById(req.params.id)
            .select('-password')
            .populate('wishlist', 'name image price')
            .lean()
        if (!user) return res.json({ success: false, message: 'Customer not found' })

        const orders = await orderModel.find({ userId: user._id }).sort({ date: -1 }).lean()
        const returns = await returnModel.find({ userId: user._id }).populate('productId', 'name').sort({ createdAt: -1 }).lean()

        const paidOrders = orders.filter((o) => o.status !== 'Cancelled')
        const totalSpend = paidOrders.reduce((s, o) => s + (o.amount || 0), 0)

        res.json({
            success: true,
            customer: {
                ...user,
                customerId: customerIdFor(user),
                stats: {
                    orders: orders.length,
                    delivered: orders.filter((o) => o.status === 'Delivered').length,
                    cancelled: orders.filter((o) => o.status === 'Cancelled').length,
                    returns: returns.length,
                    totalSpend,
                    wishlist: (user.wishlist || []).length,
                    cartItems: Object.keys(user.cartData || {}).length,
                    addresses: (user.addresses || []).length,
                },
                orders,
                returns,
            },
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// PUT /api/user/customer/:id/block   body { blocked }
const setCustomerBlock = async (req, res) => {
    try {
        const status = req.body.blocked ? 'blocked' : 'active'
        const user = await userModel.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('name status')
        if (!user) return res.json({ success: false, message: 'Customer not found' })
        res.json({ success: true, message: `Customer ${status === 'blocked' ? 'blocked' : 'unblocked'}`, status: user.status })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// PUT /api/user/customer/:id/cod   body { codDisabled }
const setCustomerCod = async (req, res) => {
    try {
        const codDisabled = !!req.body.codDisabled
        const user = await userModel.findByIdAndUpdate(req.params.id, { codDisabled }, { new: true }).select('name codDisabled')
        if (!user) return res.json({ success: false, message: 'Customer not found' })
        res.json({ success: true, message: codDisabled ? 'COD disabled for customer' : 'COD enabled', codDisabled: user.codDisabled })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// DELETE /api/user/customer/:id — remove a customer account.
const deleteCustomer = async (req, res) => {
    try {
        const user = await userModel.findByIdAndDelete(req.params.id)
        if (!user) return res.json({ success: false, message: 'Customer not found' })
        res.json({ success: true, message: 'Customer removed' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { loginUser, registerUser, adminLogin, getAllCustomers, getUserProfile, updateUserProfile, googleAuth, addAddress, deleteAddress, sendLoginOtp, verifyLoginOtp, forgotPassword, resetPassword, getCustomerDetail, setCustomerBlock, setCustomerCod, deleteCustomer }