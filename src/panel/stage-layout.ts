export type ScreenBox={x:number;y:number;width:number;height:number};
export function overlaps(a:ScreenBox,b:ScreenBox,gap=12){
 return a.x<b.x+b.width+gap && a.x+a.width+gap>b.x && a.y<b.y+b.height+gap && a.y+a.height+gap>b.y;
}

// Stay attached to the head. Only the headline or counter can select the right side.
export function placeBubble(width:number,height:number,head:{x:number;y:number;right:number},obstacles:ScreenBox[]){
 const above={x:head.x-width/2,y:head.y-height-16,tail:'bottom'};
 const box={...above,width,height:height+12};
 if(!obstacles.some(other=>overlaps(box,other,6)))return above;
 return {x:head.right+16,y:head.y-height/2,tail:'left'};
}
