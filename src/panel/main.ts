if(location.pathname==='/stage'){void import('./stage.ts');}
else if(location.pathname.startsWith('/m/')){void import('./phone.ts');}
else{void import('./panel.ts');}
