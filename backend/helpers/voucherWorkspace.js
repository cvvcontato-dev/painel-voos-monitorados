const path = require('path');
const fs = require('fs');

function root() {
  return process.env.DB_PATH || path.resolve(__dirname, '..');
}
function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }

const uploadsDir = () => ensure(path.join(root(), 'voucher-uploads'));
const exportsDir = () => ensure(path.join(root(), 'voucher-exports'));
const packageUploadsDir = () => ensure(path.join(root(), 'package-uploads'));

module.exports = { uploadsDir, exportsDir, packageUploadsDir };
