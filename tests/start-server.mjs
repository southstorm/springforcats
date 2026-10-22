import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/store.js';
const dir=mkdtempSync(join(tmpdir(),'spring-browser-'));const store=openStore(dir);store.createOwner('owner@example.test','test-only-password-42');for(const row of store.listInventory())store.setStock(row.sku,100,row.revision);const settings=store.settings();store.saveSettings({...settings.catalog,ordersEnabled:true},settings.revision);store.close();
const child=spawn(process.execPath,['scripts/dev.mjs','--port','5174','--strictPort'],{stdio:'inherit',env:{...process.env,DATA_DIR:dir,API_PORT:'3002'}});
function stop(){child.kill('SIGTERM');}process.on('SIGTERM',stop);process.on('SIGINT',stop);child.on('exit',code=>{rmSync(dir,{recursive:true,force:true});process.exit(code||0);});
