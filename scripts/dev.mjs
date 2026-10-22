import {spawn} from 'node:child_process';
const port=process.env.API_PORT||'3001';
const children=[spawn(process.execPath,['server/index.js'],{stdio:'inherit',env:{...process.env,PORT:port}}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','0.0.0.0',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,API_PORT:port}})];
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');process.exitCode=code;}
for(const c of children){c.on('error',e=>{console.error(e.message);stop(1);});c.on('exit',code=>stop(code||0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
