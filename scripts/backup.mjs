import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,cp,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const source=resolve(process.env.DATA_DIR||'.data'),destination=process.argv[2];
if(!destination)throw Error('Provide a new backup directory: npm run backup -- /secure/destination');
const target=resolve(destination);if(target===source||target.startsWith(source+'/'))throw Error('Choose a destination outside the live data directory.');
await mkdir(target,{recursive:false,mode:0o700});
const db=new DatabaseSync(join(source,'spring.sqlite'),{readOnly:true});
try{await backup(db,join(target,'spring.sqlite'));await chmod(join(target,'spring.sqlite'),0o600);try{await cp(join(source,'uploads'),join(target,'uploads'),{recursive:true,errorOnExist:true,force:false});}catch(e){if(e.code!=='ENOENT')throw e;}console.log('Database and uploaded assets backed up.');}finally{db.close();}
