import {Camera, Window, VideoEvent, VideoSource, overlaps} from './model.js';
export class MockSource implements VideoSource {
 async events(camera:Camera, window:Window) {
  const center=(window.start+window.end)/2;
  return [{id:`mock-${camera.id}-${Math.floor(center)}`,camera:camera.id,label:'person',start:center-12,end:center+18,zones:['counter'],hasClip:true}].filter(e=>overlaps(e,window));
 }
 clipPath() {return '/mock.webm';}
}
export class FrigateSource implements VideoSource {
 constructor(private base:string, private token?:string, private request:typeof fetch=fetch){}
 url(path:string) {return `${this.base.replace(/\/$/,'')}/api${path}`;}
 headers():Record<string,string> {return this.token?{Authorization:`Bearer ${this.token}`} : {};}
 async events(camera:Camera, window:Window):Promise<VideoEvent[]> {
  // Query all retained events, including events starting before the window.
  // Pagination avoids silently excluding long-running overlapping events.
  const events:VideoEvent[]=[];
  for(let offset=0;offset<10000;offset+=100){
   const query=new URLSearchParams({camera:camera.frigateName,before:String(window.end+0.001),limit:'100',offset:String(offset),include_thumbnails:'0'});
   const response=await this.request(this.url(`/events?${query}`),{headers:this.headers(),signal:AbortSignal.timeout(10000)});
   if(!response.ok) throw new Error(`Frigate events returned ${response.status}`);
   const rows=await response.json();
   if(!Array.isArray(rows))throw new Error('Invalid Frigate response');
   for(const row of rows){
    const event:VideoEvent={id:String(row.id),camera:camera.id,label:String(row.label),start:Number(row.start_time),end:row.end_time==null?null:Number(row.end_time),zones:row.zones??[],hasClip:!!row.has_clip};
    if(overlaps(event,window))events.push(event);
   }
   if(rows.length<100)return events;
  }
  throw new Error('Frigate event scan limit reached; narrow retention or implement indexed event ingestion');
 }
 clipPath(camera:Camera,window:Window) {return `/${encodeURIComponent(camera.frigateName)}/start/${window.start}/end/${window.end}/clip.mp4`;}
}
