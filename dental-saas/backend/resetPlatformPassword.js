require('module-alias/register');
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const PlatformUser = require('./src/platform/models/PlatformUser').default;

        const newPwd = 'Admin123!';
        const hash = await bcrypt.hash(newPwd, 12);

        const result = await PlatformUser.updateOne(
            { email: 'superadmin@dentalsaas.com' },
            {
                $set: { password: hash },
                $inc: { tokenVersion: 1 },
            }
        );

        console.log('✅ Updated:', result.modifiedCount);
        console.log('🔑 New password:', newPwd);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR:', err);
        process.exit(1);
    }
})();