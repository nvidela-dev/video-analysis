import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Camera,Transaction} from './model.js';
export type State={cameras:Camera[];transactions:Transaction[];settings:{beforeSeconds:number;afterSeconds:number}};
export function sample():State {
 const now=Date.now();
 return {settings:{beforeSeconds:30,afterSeconds:30},cameras:[{id:'counter',name:'Counter · demo',source:'mock',frigateName:'counter',register:'1',offsetSeconds:0}],transactions:[0,1,2].map((n)=>({id:`demo-${n+1}`,timestamp:new Date(now-n*180000).toISOString(),register:'1',amount:[18.5,42,9.75][n],currency:'USD',note:['Coffee + sandwich','Lunch order','Takeaway'][n]}))};
}
export class Store {
 state:State=sample();
 private queue=Promise.resolve();
 constructor(private path:string){}
 async init(){try{this.state=JSON.parse(await readFile(this.path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await this.save();}}
 private async save(){await mkdir(dirname(this.path),{recursive:true});await writeFile(this.path+'.tmp',JSON.stringify(this.state,null,2));await rename(this.path+'.tmp',this.path);}
 async mutate(change:(state:State)=>void){const task=this.queue.then(async()=>{const previous=structuredClone(this.state);try{change(this.state);await this.save();}catch(e){this.state=previous;throw e;}});this.queue=task.catch(()=>{});await task;}
}
