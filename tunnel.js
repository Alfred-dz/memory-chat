const localtunnel = require('localtunnel');
const PORT = process.env.PORT || 3000;

(async () => {
  const tunnel = await localtunnel({ port: PORT, subdomain: 'memory-psychologist' });
  console.log(`  Public URL: ${tunnel.url}`);
  console.log(`  QR Page:    ${tunnel.url}/qr`);
  console.log(`  Admin:      ${tunnel.url}/admin`);
  tunnel.on('close', () => console.log('Tunnel closed'));
  tunnel.on('error', (err) => console.error('Tunnel error:', err));
})();
