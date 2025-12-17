
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.resolve(__dirname, '../../../p2p_escrow/out/ERC20.sol/ERC20.json');

try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(JSON.stringify(data.abi, null, 2));
} catch (e) {
    console.error(e);
}
