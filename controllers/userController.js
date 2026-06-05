import validator from "validator";
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken'
import userModel from "../models/userModel.js";


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

        const { name, email, password, phone, dob } = req.body;

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

        const newUser = new userModel({
            name,
            email,
            password: hashedPassword,
            phone: phone || undefined,
            dob: dob || undefined
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

export { loginUser, registerUser, adminLogin, getAllCustomers, getUserProfile, updateUserProfile, googleAuth, addAddress, deleteAddress }