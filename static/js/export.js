document.getElementById('export-btn').addEventListener('click', ()=>{
  const data = isScreenMode ? screenCandidates : sortedData(currentListData());
  if (!data.length) return;
  const headers = isScreenMode
    ? ['序号','代码','名称','市场','涨跌幅%','现价','量比','换手率%','市值(亿)','30日涨停','通过','原因']
    : ['序号','代码','名称','市场','涨跌幅%','现价','涨跌额','量比','换手率%','市值(亿)','今开','最高','最低','振幅%','昨收','成交额','市盈率'];
  const rows = data.map((s,i)=>isScreenMode
    ? [i+1,s.code,s.name,s.market,fmt(s.change_pct),fmt(s.price),fmt(s.volume_ratio),fmt(s.turnover_rate),(parseFloat(s.market_cap)/1e8).toFixed(2),s.had_limit_up?'是':'否',s.pass?'是':'否',s.fail_reason||'']
    : [i+1,s.code,s.name,s.market,fmt(s.change_pct),fmt(s.price),fmt(s.change),fmt(s.volume_ratio),fmt(s.turnover_rate),(parseFloat(s.market_cap)/1e8).toFixed(2),fmt(s.open),fmt(s.high),fmt(s.low),fmtAmp(s),fmt(s.prev_close),fmtMoney(s.turnover),fmt(s.pe)]
  );
  const csv=[headers,...rows].map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`${isScreenMode?'选股结果':'涨势榜'}_${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}).replace(/[/:]/g,'-')}.csv`;
  a.click();
});
