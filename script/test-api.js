// Test script to check what the backend API returns
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 5055,
    path: '/api/products/store',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('API Response Status:', res.statusCode);

            if (Array.isArray(json)) {
                console.log('Products count:', json.length);
                json.slice(0, 10).forEach((p, i) => {
                    console.log(`${i + 1}. ${p.title?.en || 'NO TITLE'} | SKU: ${p.sku || 'N/A'}`);
                });
            } else if (json.products) {
                console.log('Products count:', json.products.length);
                json.products.slice(0, 10).forEach((p, i) => {
                    console.log(`${i + 1}. ${p.title?.en || 'NO TITLE'} | SKU: ${p.sku || 'N/A'}`);
                });
            } else {
                console.log('Response structure:', Object.keys(json));
                console.log('Raw response:', JSON.stringify(json).slice(0, 500));
            }
        } catch (e) {
            console.error('Parse error:', e.message);
            console.log('Raw response:', data.slice(0, 500));
        }
    });
});

req.on('error', (e) => {
    console.error('Request error:', e.message);
});

req.end();
