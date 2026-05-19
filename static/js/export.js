document.getElementById('export-btn').addEventListener('click', ()=>{
  const data = isScreenMode ? screenCandidates : sortedData(currentListData());
  if (!data.length) return;
  const headers = isScreenMode
    ? ['\u5e8f\u53f7','\u4ee3\u7801','\u540d\u79f0','\u5e02\u573a','\u6da8\u8dcc\u5e45','\u73b0\u4ef7','\u91cf\u6bd4','\u6362\u624b\u7387','\u5e02\u503c(\u4ebf)','30\u65e5\u6da8\u505c','\u901a\u8fc7','\u539f\u56e0']
    : ['\u5e8f\u53f7','\u4ee3\u7801','\u540d\u79f0','\u5e02\u573a','\u6da8\u8dcc\u5e45','\u73b0\u4ef7','\u6da8\u8dcc\u989d','\u91cf\u6bd4','\u6362\u624b\u7387','\u5e02\u503c(\u4ebf)','\u4eca\u5f00','\u6700\u9ad8','\u6700\u4f4e','\u632f\u5e45%','\u6628\u6536','\u6210\u4ea4\u989d','\u5e02\u76c8\u7387','\u5165\u9009\u539f\u56e0'];
  const rows = data.map((s,i)=>isScreenMode
    ? [i+1,s.code,s.name,s.market,fmt(s.change_pct),fmt(s.price),fmt(s.volume_ratio),fmt(s.turnover_rate),(parseFloat(s.market_cap)/1e8).toFixed(2),s.had_limit_up?'\u662f':'\u5426',s.pass?'\u662f':'\u5426',s.fail_reason||s.intraday_reason||'']
    : [i+1,s.code,s.name,s.market,fmt(s.change_pct),fmt(s.price),fmt(s.change),fmt(s.volume_ratio),fmt(s.turnover_rate),(parseFloat(s.market_cap)/1e8).toFixed(2),fmt(s.open),fmt(s.high),fmt(s.low),fmtAmp(s),fmt(s.prev_close),fmtMoney(s.turnover),fmt(s.pe),stockReason(s)]
  );
  const csv=[headers,...rows].map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`${isScreenMode?'\u9009\u80a1\u7ed3\u679c':'\u6da8\u52bf\u699c'}_${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}).replace(/[/:]/g,'-')}.csv`;
  a.click();
});
