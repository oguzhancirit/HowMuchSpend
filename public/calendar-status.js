export function dayStatus(items) {
  if(!items.length) return {className:'',label:''};
  const paid=items.filter(item=>item.paid).length;
  return paid===items.length
    ? {className:'status-paid',label:'Tamamlandı'}
    : {className:'status-pending'+(paid?' status-mixed':''),label:paid?'Kısmen tamamlandı; bekleyen kayıt var':'Bekliyor'};
}
