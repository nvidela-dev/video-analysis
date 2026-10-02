import express from 'express';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {z} from 'zod';
import {Store} from './store.js';
import {MockSource,FrigateSource} from './sources.js';
import {videoWindow,activitySummary} from './model.js';
const timestamp=z.string().datetime({offset:true});
const tx=z.object({timestamp,register:z.string().trim().min(1).max(80),amount:z.number().nonnegative().finite(),currency:z.string().regex(/^[A-Z]{3}$/).default('USD'),note:z.string().max(500).default('')});
const camera=z.object({name:z.string().trim().min(1).max(100),source:z.enum(['mock','frigate']),frigateName:z.string().regex(/^[a-zA-Z0-9_-]+$/),register:z.string().trim().min(1).max(80),offsetSeconds:z.number().int().min(-3600).max(3600).default(0)});
const settings=z.object({beforeSeconds:z.number().int().min(0).max(600),afterSeconds:z.number().int().min(0).max(600)});
export function createApp(store:Store,options:{frigateUrl?:string;frigateToken?:string;publicDir?:string}={}) {
 const app=express(); app.use(express.json({limit:'1mb'}));
 const mock=new MockSource();const frigate=options.frigateUrl?new FrigateSource(options.frigateUrl,options.frigateToken):undefined;
 const source=(kind:string)=>{if(kind==='mock')return mock;if(!frigate)throw new Error('FRIGATE_URL is not configured');return frigate;};
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.get('/api/state',(_req,res)=>res.json({...store.state,transactions:[...store.state.transactions].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)),frigateConfigured:!!frigate}));
 app.post('/api/transactions',async(req,res)=>{const data=tx.parse(req.body);const item={...data,timestamp:new Date(data.timestamp).toISOString(),id:randomUUID()};await store.mutate(s=>s.transactions.push(item));res.status(201).json(item);});
 app.post('/api/transactions/import',async(req,res)=>{const data=z.array(tx).min(1).max(1000).parse(req.body);const items=data.map(t=>({...t,id:randomUUID(),timestamp:new Date(t.timestamp).toISOString()}));await store.mutate(s=>s.transactions.push(...items));res.status(201).json({imported:items.length});});
 app.post('/api/cameras',async(req,res)=>{const item={...camera.parse(req.body),id:randomUUID()};await store.mutate(s=>s.cameras.push(item));res.status(201).json(item);});
 app.put('/api/cameras/:id',async(req,res)=>{const data=camera.parse(req.body);if(!store.state.cameras.some(c=>c.id===req.params.id))return res.status(404).json({error:'Camera not found'});await store.mutate(s=>{s.cameras=s.cameras.map(c=>c.id===req.params.id?{...data,id:c.id}:c);});res.json({ok:true});});
 app.put('/api/settings',async(req,res)=>{const data=settings.parse(req.body);await store.mutate(s=>{s.settings=data;});res.json(data);});
 app.get('/api/cameras/:id/live',async(req,res)=>{
  const c=store.state.cameras.find(c=>c.id===req.params.id);if(!c)return res.status(404).json({error:'Camera not found'});
  if(c.source!=='frigate'||!frigate)return res.status(503).json({error:'Live analysis requires a configured Frigate camera'});
  const r=await fetch(frigate.url('/events?'+new URLSearchParams({camera:c.frigateName,in_progress:'1',limit:'100',include_thumbnails:'0'})),{headers:frigate.headers(),signal:AbortSignal.timeout(10000)});
  if(!r.ok)return res.status(502).json({error:'Frigate live events unavailable'});
  const rows=await r.json();res.json({timestamp:new Date().toISOString(),tracks:rows.filter((e:any)=>e.label==='person').map((e:any)=>({id:e.id,start:e.start_time,zonesVisited:e.zones??[],score:e.data?.score??null})),limit:100});
 });
 app.get('/api/cameras/:id/stream',async(req,res)=>{
  const c=store.state.cameras.find(c=>c.id===req.params.id);if(!c||c.source!=='frigate'||!frigate)return res.status(404).json({error:'Frigate camera not found'});
  const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>controller.abort());
  const r=await fetch(frigate.url('/'+encodeURIComponent(c.frigateName)+'?fps=5&bbox=1&motion=1&zones=1'),{headers:frigate.headers(),signal:controller.signal});
  if(!r.ok||!r.body)return res.status(502).json({error:'Live stream unavailable'});
  res.setHeader('Content-Type',r.headers.get('content-type')??'multipart/x-mixed-replace');res.setHeader('Cache-Control','no-store');
  await pipeline(Readable.fromWeb(r.body as any),res);
 });
 app.get('/api/transactions/:id',async(req,res)=>{
  const transaction=store.state.transactions.find(t=>t.id===req.params.id);if(!transaction)return res.status(404).json({error:'Transaction not found'});
  const {beforeSeconds,afterSeconds}=store.state.settings;
  const matches=await Promise.all(store.state.cameras.filter(c=>c.register===transaction.register).map(async camera=>{
   const window=videoWindow(transaction.timestamp,beforeSeconds,afterSeconds,camera.offsetSeconds);
   try{const events=await source(camera.source).events(camera,window);return {camera,window,events,activity:activitySummary(events,window,Date.parse(transaction.timestamp)/1000+camera.offsetSeconds),clipUrl:camera.source==='mock'?mock.clipPath():`/api/transactions/${transaction.id}/cameras/${camera.id}/clip`};}
   catch(e){return {camera,window,events:[],error:(e as Error).message};}
  }));res.json({transaction,matches});
 });
 app.get('/api/transactions/:id/cameras/:cameraId/clip',async(req,res)=>{
  const t=store.state.transactions.find(t=>t.id===req.params.id);const c=store.state.cameras.find(c=>c.id===req.params.cameraId);
  if(!t||!c||c.register!==t.register)return res.status(404).json({error:'Match not found'});
  if(c.source==='mock')return res.redirect('/mock.webm');
  if(!frigate)return res.status(503).json({error:'Frigate is not configured'});
  const w=videoWindow(t.timestamp,store.state.settings.beforeSeconds,store.state.settings.afterSeconds,c.offsetSeconds);
  // Frigate generates this clip dynamically. Forwarding browser Range headers
  // is unnecessary for this streaming endpoint. Stream the generated clip whole.
  const headers:Record<string,string>={...frigate.headers()};
  const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>controller.abort());
  const response=await fetch(frigate.url(frigate.clipPath(c,w)),{headers,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])});
  if(!response.ok||!response.body)return res.status(502).json({error:`Frigate clip unavailable (${response.status}); check retained recordings`});
  res.status(response.status);for(const name of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers.get(name);if(value)res.setHeader(name,value);}
  await pipeline(Readable.fromWeb(response.body as any),res);
 });
 app.use(express.static(options.publicDir??'public'));
 app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(res.headersSent){res.end();return;}res.status(error instanceof z.ZodError?400:500).json({error:error instanceof z.ZodError?'Invalid input':error.message});});
 return app;
}
