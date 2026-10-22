import readline from 'node:readline';
import {Writable} from 'node:stream';
import {resolve} from 'node:path';
import {openStore} from './store.js';
const store=openStore(resolve(process.env.DATA_DIR||'.data'));
let rl;
try{
 if(store.hasOwner())throw Error('An owner account already exists. This command will not overwrite it.');
 if(!process.stdin.isTTY)throw Error('Use an interactive terminal to enter your owner login securely.');
 let muted=false;
 const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
 rl=readline.createInterface({input:process.stdin,output,terminal:true,historySize:0});
 rl.on('SIGINT',()=>{rl.close();store.close();process.exit(130);});
 const question=q=>new Promise(resolve=>rl.question(q,resolve));
 const email=await question('Owner email: ');
 process.stdout.write('Password (12–128 characters; hidden): ');muted=true;
 const password=await question('');muted=false;process.stdout.write('\n');
 rl.close();store.createOwner(email,password);console.log('Owner account created. Sign in through the Admin link in the website footer.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{rl?.close();store.close();process.stdin.pause();}
