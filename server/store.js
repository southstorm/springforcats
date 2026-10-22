import { DatabaseSync } from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {upgradeCapsulePacks} from '../shared/capsules.js';
import {seedCatalog} from '../shared/seed.js';
import {initializeOrders,orderStore} from './orders.js';
import {validateCatalog} from '../shared/catalog.js';
export const tokenHash=t=>createHash('sha256').update(t).digest('hex');
export function openStore(dir){
 mkdirSync(dir,{recursive:true,mode:0o700});
 const db=new DatabaseSync(join(dir,'spring.sqlite'));chmodSync(join(dir,'spring.sqlite'),0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS documents (name TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS owners (email TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);`);
 const seed=JSON.stringify(validateCatalog(seedCatalog));
 for(const name of ['draft','live'])db.prepare('INSERT OR IGNORE INTO documents VALUES (?,1,?)').run(name,seed);
 initializeOrders(db);
 db.exec('BEGIN IMMEDIATE');
 try{for(const name of ['draft','live']){const row=db.prepare('SELECT value FROM documents WHERE name=?').get(name);const next=upgradeCapsulePacks(JSON.parse(row.value));if(JSON.stringify(next)!==row.value)db.prepare('UPDATE documents SET value=?,revision=revision+1 WHERE name=?').run(JSON.stringify(next),name);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 function read(name){const r=db.prepare('SELECT revision,value FROM documents WHERE name=?').get(name);return {revision:r.revision,catalog:JSON.parse(r.value)};}
 const orders=orderStore(db,read);orders.syncInventory(read('live').catalog);
 function save(catalog,revision){
  const clean=validateCatalog(catalog);
  const r=db.prepare("UPDATE documents SET value=?,revision=revision+1 WHERE name='draft' AND revision=?").run(JSON.stringify(clean),revision);
  if(!r.changes){const e=Error('Another edit was saved. Reload the draft before saving again.');e.status=409;throw e;}
  return read('draft');
 }
 function publish(revision){
  db.exec('BEGIN IMMEDIATE');try{
   const draft=read('draft');if(draft.revision!==revision){const e=Error('The draft changed. Reload it before publishing.');e.status=409;throw e;}
   db.prepare("UPDATE documents SET value=?,revision=? WHERE name='live'").run(JSON.stringify(draft.catalog),draft.revision);
   orders.syncInventory(draft.catalog);db.exec('COMMIT');return {revision:draft.revision};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function createOwner(email,password){
  email=email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Enter a valid email address.');
  if(typeof password!=='string'||password.length<12||password.length>128)throw Error('Use a password of 12–128 characters.');
  const salt=randomBytes(16).toString('hex'),hash=scryptSync(password,salt,64).toString('hex');
  if(db.prepare('SELECT count(*) AS n FROM owners').get().n)throw Error('An owner account already exists.');
  db.prepare('INSERT INTO owners VALUES(?,?,?)').run(email,salt,hash);
 }
 function login(email,password){
  const owner=db.prepare('SELECT * FROM owners WHERE email=?').get(email.trim().toLowerCase());
  const candidate=scryptSync(password,owner?.salt||'spring-dummy-salt',64);
  const expected=Buffer.from(owner?.hash||'00'.repeat(64),'hex');
  if(!timingSafeEqual(candidate,expected)||!owner)return null;
  const token=randomBytes(32).toString('base64url'),expires=Date.now()+12*60*60*1000;
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),owner.email,expires);
  return {token,email:owner.email};
 }
 function session(token){if(!token)return null;return db.prepare('SELECT email FROM sessions WHERE hash=? AND expires>?').get(tokenHash(token),Date.now())||null;}
 function logout(token){if(token)db.prepare('DELETE FROM sessions WHERE hash=?').run(tokenHash(token));}
 return {...orders,read,save,publish,createOwner,login,session,logout,hasOwner:()=>!!db.prepare('SELECT 1 FROM owners LIMIT 1').get(),close:()=>db.close()};
}
