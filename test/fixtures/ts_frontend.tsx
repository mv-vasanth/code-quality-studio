import React, { useState, useEffect } from 'react';
export function List({ items, cfg }: any) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { const id = setInterval(() => setData(1), 1000); });
  useEffect(async () => { await fetch('/api'); }, []);
  const v = localStorage.getItem('k')!;
  return (<div dangerouslySetInnerHTML={{ __html: cfg.html }}>
      {items.map((it: any, i: number) => <li key={i} onClick={() => go(it)}>{it}</li>)}
      <span onClick={() => go()}>click</span>
      <button><img src="/i.png" /></button>
    </div>);
}
