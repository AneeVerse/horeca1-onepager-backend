require('dotenv').config();
const mongoose = require('mongoose');

// Correct Company Details
const COMPANY_NAME = "HCX Global Pvt. Ltd.";
const CORRECT_ADDRESS = "C-003, Station Complex, Sanpada, Navi Mumbai - 400705";
const GST_NUMBER = "27AAJCH7899F1ZC"; // Update this with actual GST number if different

async function updateCompanyDetails() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB:', mongoose.connection.db.databaseName);

        const db = mongoose.connection.db;

        // Update globalSetting
        console.log('\n=== Updating globalSetting ===');
        const globalResult = await db.collection('settings').updateOne(
            { name: 'globalSetting' },
            {
                $set: {
                    'setting.address': CORRECT_ADDRESS,
                    'setting.company_name': COMPANY_NAME,
                    'setting.vat_number': GST_NUMBER,
                }
            }
        );
        console.log('globalSetting updated:', globalResult.modifiedCount > 0 ? 'Yes' : 'No change');

        // Verify
        const globalSetting = await db.collection('settings').findOne({ name: 'globalSetting' });
        console.log('Current globalSetting:');
        console.log('  - Address:', globalSetting?.setting?.address);
        console.log('  - Company Name:', globalSetting?.setting?.company_name);
        console.log('  - VAT/GST Number:', globalSetting?.setting?.vat_number);

        // Update storeSetting if exists
        console.log('\n=== Updating storeSetting ===');
        const storeResult = await db.collection('settings').updateOne(
            { name: 'storeSetting' },
            {
                $set: {
                    'setting.address': CORRECT_ADDRESS,
                    'setting.company_name': COMPANY_NAME,
                    'setting.vat_number': GST_NUMBER,
                }
            }
        );
        console.log('storeSetting updated:', storeResult.modifiedCount > 0 ? 'Yes' : 'No change (may not exist)');

        // Check storeSetting
        const storeSetting = await db.collection('settings').findOne({ name: 'storeSetting' });
        if (storeSetting) {
            console.log('Current storeSetting:');
            console.log('  - Address:', storeSetting?.setting?.address);
            console.log('  - Company Name:', storeSetting?.setting?.company_name);
            console.log('  - VAT/GST Number:', storeSetting?.setting?.vat_number);
        }

        await mongoose.disconnect();
        console.log('\n✅ Done! Address and company details updated.');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

updateCompanyDetails();
