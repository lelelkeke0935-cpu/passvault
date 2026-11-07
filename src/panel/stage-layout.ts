export type ScreenBox={x:number;y:number;width:number;height:number};
export function overlaps(a:ScreenBox,b:ScreenBox,gap=12){
 return a.x<b.x+b.width+gap && a.x+a.width+gap>b.x && a.y<b.y+b.height+gap && a.y+a.height+gap>b.y;
}

// Try the robot's right side and lower blank space, then use the reserved text row.
// Bounds include the tail, so the speech pointer cannot cross another overlay.
export function placeBubble(width:number,height:number,head:{x:number;y:number},obstacles:ScreenBox[],area:ScreenBox,fallback:{x:number;y:number}){
 const candidates=[
  {x:head.x+24,y:head.y-height/2,tail:'left'},
  {x:head.x-width/2,y:head.y+40,tail:'top'},
  {x:fallback.x,y:fallback.y,tail:'bottom'},
 ];
 for(const candidate of candidates){
  const box={x:candidate.x-14,y:candidate.y-14,width:width+28,height:height+28};
  if(box.x>=area.x-14&&box.y>=area.y-14&&box.x+box.width<=area.x+area.width+14&&box.y+box.height<=area.y+area.height+14&&!obstacles.some(other=>overlaps(box,other,4)))return candidate;
 }
 return {...fallback,tail:'none'};
}
