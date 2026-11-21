import type {GenerateJsocLogs,JsocCategory,JsocSeverity} from '@cyris/contracts';

/** Tabletop data only; uses RFC 5737 documentation IP space and invented host names. */
export type SyntheticEntry={
  category:JsocCategory; severity:JsocSeverity;
  source:string; message:string;
  sourceAddress:string;destinationAddress:string;
  observedAt:Date;scenario:string;
};
const templates:Record<JsocCategory,readonly [string,JsocSeverity,JsocSeverity][]> = {
  AUTH:[
    ['Simulated failed authentication burst on exercise account','MEDIUM','HIGH'],
    ['Simulated privileged login observed outside the planned training window','LOW','HIGH'],
    ['Simulated sign-in from an unrecognized exercise workstation','LOW','MEDIUM'],
  ],
  NETWORK:[
    ['Simulated unexpected east-west traffic between training segments','MEDIUM','HIGH'],
    ['Simulated firewall rule mismatch detected in training topology','LOW','MEDIUM'],
    ['Simulated unusual connection volume toward the exercise gateway','HIGH','CRITICAL'],
  ],
  DNS:[
    ['Simulated repeated DNS requests for an unrecognized training domain','LOW','MEDIUM'],
    ['Simulated unexpected DNS resolution change in the exercise zone','MEDIUM','HIGH'],
    ['Simulated DNS query volume anomaly','LOW','MEDIUM'],
  ],
  ENDPOINT:[
    ['Simulated endpoint policy alert on a training workstation','MEDIUM','HIGH'],
    ['Simulated endpoint security agent not reporting','LOW','MEDIUM'],
    ['Simulated suspicious executable flagged in an isolated exercise environment','HIGH','CRITICAL'],
  ],
  APPLICATION:[
    ['Simulated application error spike on an exercise service','LOW','MEDIUM'],
    ['Simulated unexpected access-denied responses in a training app','LOW','HIGH'],
    ['Simulated delayed application telemetry delivery','INFO','MEDIUM'],
  ],
};
const categories=Object.keys(templates) as JsocCategory[];
function random(seed:number){
  let state=seed|0;
  return (max:number)=>{
    state=(state+0x6d2b79f5)|0;
    let x=Math.imul(state^(state>>>15),state|1);
    x^=x+Math.imul(x^(x>>>7),x|61);
    return ((x^(x>>>14))>>>0)%max;
  };
}
export function createSyntheticJsocLogs(input:GenerateJsocLogs,now:Date):SyntheticEntry[]{
  const pick=random(input.seed);
  const data:SyntheticEntry[]=[];
  for(let i=0;i<input.count;i++){
    const category=categories[pick(categories.length)]!;
    const options=templates[category];
    const [message,low,high]=options[pick(options.length)]!;
    const severity=pick(4)===0?high:low;
    const source='training-'+category.toLowerCase()+'-'+String(pick(40)+1).padStart(3,'0');
    const sourceAddress='192.0.2.'+(pick(240)+1);
    const destinationAddress=(pick(2)?'198.51.100.':'203.0.113.')+(pick(240)+1);
    data.push({
      category,severity,source,message,
      observedAt:new Date(now.getTime()-(input.count-i)*45000),
      sourceAddress,destinationAddress,scenario:input.scenario,
    });
  }
  return data;
}
