/** @module @pigmentlab/kernels - Original WGSL compute kernels; no framework dependency. */
export const simulationWGSL = /* wgsl */ `
struct Cell { mobile: vec4<f32>, fixed: vec4<f32>, material: vec4<f32> }
struct Dab { geom:vec4<f32>, ink:vec4<f32>, dynamics:vec4<f32>, flags:vec4<f32>, motion:vec4<f32> }
struct Tile { pos:vec2<u32>, start:u32, count:u32 }
struct Params { size:vec4<u32>, sim:vec4<f32>, env:vec4<f32>, control:vec4<f32> }
@group(0) @binding(0) var<storage,read> source:array<Cell>;
@group(0) @binding(1) var<storage,read_write> destination:array<Cell>;
@group(0) @binding(2) var<storage,read> dabs:array<Dab>;
@group(0) @binding(3) var<storage,read> tiles:array<Tile>;
@group(0) @binding(4) var<storage,read> indices:array<u32>;
@group(0) @binding(5) var<storage,read> paper:array<vec4<f32>>;
@group(0) @binding(6) var<storage,read> selection:array<f32>;
@group(0) @binding(7) var<uniform> p:Params;
fn noise(x:u32,y:u32,seed:u32)->f32 { var n=x*374761393u+y*668265263u+seed*69069u;n=(n^(n>>13u))*1274126177u;return f32(n^(n>>16u))/4294967295.0; }
fn pixel(wg:vec3<u32>,local:vec3<u32>)->vec2<u32> { return tiles[wg.z].pos*32u+wg.xy*8u+local.xy; }
fn idx(x:i32,y:i32)->u32 { return u32(clamp(y,0,i32(p.size.y)-1))*p.size.x+u32(clamp(x,0,i32(p.size.x)-1)); }
fn blendCell(a:Cell,b:Cell,t:f32)->Cell { return Cell(mix(a.mobile,b.mobile,t),mix(a.fixed,b.fixed,t),vec4<f32>(mix(a.material.xyz,b.material.xyz,t),a.material.w)); }
fn scaledPigment(a:Cell,t:f32)->Cell { return Cell(a.mobile*t,a.fixed*t,vec4<f32>(a.material.xyz*t,a.material.w)); }
@compute @workgroup_size(8,8,1)
fn stamp(@builtin(workgroup_id) wg:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>) {
 let xy=pixel(wg,local);if(any(xy>=p.size.xy)){return;} let i=xy.y*p.size.x+xy.x;let tile=tiles[wg.z]; var c=source[i];
 let at=vec2<f32>(xy)+vec2<f32>(.5);
 for(var j=0u;j<tile.count;j++) {
  let d=dabs[indices[tile.start+j]]; let tool=u32(d.flags.y);let cs=cos(d.flags.x);let sn=sin(d.flags.x);let v=at-d.geom.xy;
  let q=vec2<f32>((v.x*cs+v.y*sn)/d.geom.z,(-v.x*sn+v.y*cs)/(d.geom.z*d.geom.w));
  var r=length(q); if(u32(d.motion.w)==1u){r=max(abs(q.x),abs(q.y));} if(r>=1.0){continue;}
  let hard=clamp(d.dynamics.z,0.0,.98);var amount=(1.0-smoothstep(hard,1.0,r))*d.dynamics.y*selection[i];
  let n=noise(xy.x,xy.y,u32(d.flags.z));let grain=d.dynamics.w;
  amount*=mix(1.0,smoothstep(grain*.64,1.0,paper[i].x+n*.32),grain);
  if(u32(d.motion.w)==2u){amount*=.34+.66*pow(abs(sin(q.y*d.geom.z*2.1+sin(q.x*7.0))),.55);}
  if(u32(d.motion.w)==3u){amount*=select(0.0,2.0,n>.94);}
  if(tool!=13u && tool!=14u){amount*=1.0-c.material.w;}
  if(p.size.w==1u && c.material.x+c.material.y<.001 && tool!=13u && tool!=14u){amount=0.0;}
  amount=clamp(amount,0.0,1.0);if(amount<=0.0){continue;}
  let m=d.ink.w*amount*.30;
  if(tool==8u){c=scaledPigment(c,1.0-amount*.48);}
  else if(tool==9u){c.mobile.w=min(4.0,c.mobile.w+amount*d.dynamics.x*.4);}
  else if(tool==10u){let t=amount*.5;c.fixed=vec4<f32>(c.fixed.xyz+c.mobile.xyz*t,c.fixed.w);c.material.y+=c.material.x*t;c.material.x*=1.0-t;c.mobile=vec4<f32>(c.mobile.xyz*(1.0-t),c.mobile.w*(1.0-t));c.material.z*=1.0-t;}
  else if(tool==13u){c.material.w=min(1.0,c.material.w+amount*.55);}
  else if(tool==14u){c.material.w*=1.0-amount*.7;}
  else if(tool==11u || tool==15u || tool==16u){
   let stride=max(1,i32(d.geom.z*.12));var sample=source[idx(i32(xy.x)-stride,i32(xy.y))];
   sample=blendCell(sample,source[idx(i32(xy.x)+stride,i32(xy.y))],.5);
   sample=blendCell(sample,source[idx(i32(xy.x),i32(xy.y)-stride)],.3333333);
   sample=blendCell(sample,source[idx(i32(xy.x),i32(xy.y)+stride)],.25);
   if(tool==15u || tool==16u){sample=source[idx(i32(f32(xy.x)-d.motion.x*2.0),i32(f32(xy.y)-d.motion.y*2.0))];}
   if(tool==16u){c.mobile=mix(c.mobile,sample.mobile,amount*.5);c.material.x=mix(c.material.x,sample.material.x,amount*.5);}
   else{c=blendCell(c,sample,amount*.35);}
  }
  else if(tool==0u || tool==3u){
   let settle=select(.0,.65,tool==3u); c.mobile=vec4<f32>(c.mobile.xyz+d.ink.xyz*m*(1.0-settle),min(4.0,c.mobile.w+amount*d.dynamics.x*.22));
   c.fixed=vec4<f32>(c.fixed.xyz+d.ink.xyz*m*settle,c.fixed.w);c.material.x+=m*(1.0-settle);c.material.y+=m*settle;
  }
  else {
   if(tool==12u){let sample=source[idx(i32(f32(xy.x)-d.motion.x),i32(f32(xy.y)-d.motion.y))];c=blendCell(c,sample,amount*.12);}
   c.fixed=vec4<f32>(c.fixed.xyz+d.ink.xyz*m,c.fixed.w);c.material.y+=m;
   if(tool==1u || tool==2u || tool==12u){c.fixed.w=min(8.0,c.fixed.w+m*d.motion.z*2.0);}
  }
 }
 destination[i]=c;
}
@compute @workgroup_size(8,8,1)
fn step(@builtin(workgroup_id) wg:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>) {
 let xy=pixel(wg,local);if(any(xy>=p.size.xy)){return;}let i=xy.y*p.size.x+xy.x;let c=source[i];var out=c;
 let dt=clamp(p.sim.x*60.0,0.0,1.0);let water=c.mobile.w;let dirs=array<vec2<i32>,4>(vec2<i32>(1,0),vec2<i32>(-1,0),vec2<i32>(0,1),vec2<i32>(0,-1));
 for(var j=0u;j<4u;j++){
  let nxy=vec2<i32>(xy)+dirs[j];if(any(nxy<vec2<i32>(0))||any(nxy>=vec2<i32>(p.size.xy))){continue;}
  let ni=u32(nxy.y)*p.size.x+u32(nxy.x);let n=source[ni];let nw=n.mobile.w;
  let barrier=(1.0-c.material.w)*(1.0-n.material.w);
  let speed=(water-nw)*.085+(paper[i].x-paper[ni].x)*min(water+nw,1.0)*.025+dot(p.env.xy,vec2<f32>(dirs[j]))*.042;
  let fo=min(max(speed,0.0),water*.10)*barrier*dt;
  let fi=min(max(-speed,0.0),nw*.10)*barrier*dt;
  let ro=fo/max(water,.00001);let ri=fi/max(nw,.00001);
  let dif=clamp(p.sim.z,0.0,1.0)*.055*min(min(water,nw),1.0)*barrier*dt;
  out.mobile=vec4<f32>(out.mobile.xyz+n.mobile.xyz*(ri+dif)-c.mobile.xyz*(ro+dif),out.mobile.w+fi-fo);
  out.material.x+=n.material.x*(ri+dif)-c.material.x*(ro+dif);
 }
 out.mobile=max(out.mobile,vec4<f32>(0.0));out.material.x=max(out.material.x,0.0);
 let absorbed=min(out.mobile.w,paper[i].y*.008*dt*(1.0-min(c.material.z,.95)));
 out.mobile.w=max(0.0,out.mobile.w-absorbed-(.0004+p.sim.y*.007)*dt);
 out.material.z=clamp(c.material.z+absorbed*.6-(.0003+p.sim.y*.0015)*dt,0.0,1.0);
 let rewet=min(.005*dt*max(out.mobile.w-.15,0.0),.04)*exp(-c.fixed.w*30.0)*(1.0-c.material.w);
 out.mobile=vec4<f32>(out.mobile.xyz+c.fixed.xyz*rewet,out.mobile.w);out.fixed=vec4<f32>(out.fixed.xyz-c.fixed.xyz*rewet,out.fixed.w);
 out.material.x+=c.material.y*rewet;out.material.y-=c.material.y*rewet;
 var deposit=clamp((.009+paper[i].y*.016+(1.0-paper[i].x)*p.sim.w*.04)*dt,0.0,.4);
 if(out.mobile.w<.025){deposit=max(deposit,1.0-out.mobile.w/.025);}
 out.fixed=vec4<f32>(out.fixed.xyz+out.mobile.xyz*deposit,out.fixed.w);
 out.material.y+=out.material.x*deposit;out.mobile=vec4<f32>(out.mobile.xyz*(1.0-deposit),out.mobile.w);out.material.x*=1.0-deposit;
 destination[i]=out;
}
@compute @workgroup_size(8,8,1)
fn operate(@builtin(workgroup_id) wg:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>){
 let xy=pixel(wg,local);if(any(xy>=p.size.xy)){return;}let i=xy.y*p.size.x+xy.x;var c=source[i];let s=selection[i];let mode=p.size.z;
 if(mode==1u){c.fixed=vec4<f32>(c.fixed.xyz+c.mobile.xyz*s,c.fixed.w);c.material.y+=c.material.x*s;c.material.x*=1.0-s;c.mobile*=1.0-s;c.material.z*=1.0-s;}
 else if(mode==2u){c.mobile.w=min(4.0,c.mobile.w+s*(1.0-c.material.w)*p.control.x);}
 else if(mode==3u){c=scaledPigment(c,1.0-s);}
 else if(mode==4u){c.material.w*=1.0-s;}
 else if(mode==5u){let a=dot(c.mobile.xyz,vec3<f32>(.2126,.7152,.0722));let b=dot(c.fixed.xyz,vec3<f32>(.2126,.7152,.0722));c.mobile=vec4<f32>(mix(c.mobile.xyz,vec3<f32>(a),s),c.mobile.w);c.fixed=vec4<f32>(mix(c.fixed.xyz,vec3<f32>(b),s),c.fixed.w);}
 destination[i]=c;
}
`;
