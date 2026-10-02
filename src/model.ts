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
