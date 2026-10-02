export type Camera = {id:string; name:string; source:'mock'|'frigate'; frigateName:string; register:string; offsetSeconds:number};
export type Transaction = {id:string; timestamp:string; register:string; amount:number; currency:string; note:string};
export type VideoEvent = {id:string; camera:string; label:string; start:number; end:number|null; zones:string[]; hasClip:boolean};
export type Window = {start:number; end:number};
export function videoWindow(timestamp:string, before:number, after:number, offset=0):Window {
 const center=Date.parse(timestamp)/1000+offset;
 return {start:center-before,end:center+after};
}
export function overlaps(event:VideoEvent,window:Window) {return event.start<=window.end && (event.end??Infinity)>=window.start;}
export interface VideoSource { events(camera:Camera, window:Window):Promise<VideoEvent[]>; clipPath(camera:Camera,window:Window):string; }

// Track counts are detector estimates, never counts of unique human identities.
export function activitySummary(events:VideoEvent[],window:Window,at:number) {
 const people=[...new Map(events.filter(e=>e.label==='person'&&overlaps(e,window)).map(e=>[e.id,e])).values()];
 const points=people.flatMap(e=>[{time:Math.max(e.start,window.start),delta:1},{time:Math.min(e.end??window.end,window.end),delta:-1}]);
 // Inclusive overlap: starts precede ends at equal timestamps.
 points.sort((a,b)=>a.time-b.time||b.delta-a.delta);
 let active=0,peak=0;for(const point of points){active+=point.delta;peak=Math.max(peak,active);}
 return {personTracks:people.length,peakConcurrentTracks:peak,tracksAtTransaction:people.filter(e=>e.start<=at&&(e.end??Infinity)>=at).length,zonesVisited:[...new Set(people.flatMap(e=>e.zones))].sort()};
}
