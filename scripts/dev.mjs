import {context} from 'esbuild';
import {options,prepare} from './build.mjs';
await prepare();
const ctx=await context(options);
await ctx.watch();
const server=await ctx.serve({servedir:'.',host:'127.0.0.1',port:Number(process.env.PORT||8000)});
console.log(`Planet editor: http://127.0.0.1:${server.port}/`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await ctx.dispose();process.exit(0);});
