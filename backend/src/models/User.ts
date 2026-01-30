import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        unique: true,
        sparse: true, // Allows null but enforces uniqueness when present
        lowercase: true
    },
    email: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true
    },
    password: {
        type: String,
        required: false // Only required for email/password auth
    },
    username: {
        type: String,
        required: false
    },
    firstName: {
        type: String,
        required: false,
        trim: true
    },
    lastName: {
        type: String,
        required: false,
        trim: true
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true
    },
    referredBy: {
        type: String,
        required: false
    },
    referralPoints: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLoginAt: {
        type: Date,
        default: Date.now
    },
    hasCompletedFirstTrade: {
        type: Boolean,
        default: false
    }
});

// Generate a unique referral code before saving
userSchema.pre('save', function () {
    if (!this.referralCode) {
        this.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
});

const User = mongoose.model('User', userSchema);
export default User;
