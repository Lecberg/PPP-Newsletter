import { GoogleAuth } from 'google-auth-library';
if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Sheets setup credentials are missing.');
const auth = new GoogleAuth({credentials:JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),scopes:['https://www.googleapis.com/auth/spreadsheets']});
const token = await (await auth.getClient()).getAccessToken();
const productionId=process.env.GOOGLE_SHEET_ID;
const previewIndex=process.argv.indexOf('--preview-sheet');
const targetId=previewIndex<0?productionId:process.argv[previewIndex+1];
if(!targetId||(previewIndex>=0&&targetId===productionId)) throw new Error('Preview setup requires a separate Sheet.');
const base = 'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(targetId);
async function call(suffix,method='GET',body) {
  const response=await fetch(base+suffix,{method,headers:{Authorization:'Bearer '+token.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error('Drafting settings setup failed: HTTP '+response.status);
  return response.json();
}
if(previewIndex>=0) {
  const metadata=await call('?fields=sheets(properties(sheetId,title))');
  const missing=['Config','Sources'].filter(title=>!metadata.sheets.some(s=>s.properties.title===title));
  if(missing.length) {
    await call(':batchUpdate','POST',{requests:missing.map(title=>({addSheet:{properties:{title,gridProperties:{rowCount:100,columnCount:10}}}}))});
    const origin=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(productionId)+'/values:batchGet?ranges=Config!A1:AZ&ranges=Sources!A1:AZ',{headers:{Authorization:'Bearer '+token.token},signal:AbortSignal.timeout(15000)});
    if(!origin.ok) throw new Error('Existing settings could not be read.');
    const ranges=(await origin.json()).valueRanges;
    const data=missing.map(title=>({range:title+'!A1',values:ranges[title==='Config'?0:1].values??[]}));
    await call('/values:batchUpdate','POST',{valueInputOption:'RAW',data});
  }
}
const values=(await call('/values/Config!A1:AZ')).values??[];
const k=values[0]?.indexOf('key'),v=values[0]?.indexOf('value');
if(k<0||v<0) throw new Error('Config headers are missing.');
const sheets=await call('?fields=sheets(properties(sheetId,title))');
const sheetId=sheets.sheets.find(s=>s.properties.title==='Config')?.properties.sheetId;
if(sheetId===undefined) throw new Error('Config worksheet is missing.');
const matches=values.slice(1).flatMap((row,index)=>row[k]?.trim()==='automatic_drafting_enabled'?[index+1]:[]);
const requests=matches.map(rowIndex=>({updateCells:{start:{sheetId,rowIndex,columnIndex:v},rows:[{values:[{userEnteredValue:{stringValue:'FALSE'}}]}],fields:'userEnteredValue'}}));
if(!matches.length) {
  const row=Array.from({length:Math.max(k,v)+1},()=>({userEnteredValue:{stringValue:''}}));
  row[k].userEnteredValue.stringValue='automatic_drafting_enabled';row[v].userEnteredValue.stringValue='FALSE';
  requests.push({appendCells:{sheetId,rows:[{values:row}],fields:'userEnteredValue'}});
}
await call(':batchUpdate','POST',{requests});
console.log('Automatic drafting initialized Off. Existing schedule, sources, and editing instructions preserved.');
