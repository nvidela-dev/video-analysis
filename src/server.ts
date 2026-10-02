import {Store} from './store.js';
import {createApp} from './app.js';
const store=new Store(process.env.DATA_FILE??'data/state.json');await store.init();
const app=createApp(store,{frigateUrl:process.env.FRIGATE_URL,frigateToken:process.env.FRIGATE_TOKEN});
const server=app.listen(Number(process.env.PORT??3040),process.env.HOST??'127.0.0.1',()=>console.log('Camera Ledger ready on port '+(process.env.PORT??3040)));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
